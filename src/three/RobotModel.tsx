import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh, MeshStandardMaterial } from "three";

import {
  MATERIALS,
  MM,
  PARTS,
  PIVOTS,
  REST_POSE,
  SERVOS,
  SURFACE,
  type MaterialId,
  type PartPlacement,
} from "./assembly";
import { JOINTS, type JointName } from "../robot/config";
import { useRobotStore } from "../robot/store";
import { toolAnchor } from "./framing";
import { applySurfaceDetail, facetGeometry } from "./surface";

/* ------------------------------------------------------------------ */
/* Joint mapping                                                        */
/* ------------------------------------------------------------------ */

/**
 * How a servo angle becomes a joint rotation.
 *
 * `scale` converts servo degrees into world degrees, `sign` sets the default
 * direction. Both are assumptions: the real direction of every axis depends on
 * how the arm was assembled and is established with the Calibration workflow.
 */
/**
 * The browser model.
 *
 * The path is built from the Vite base so it also resolves when the site is
 * served from a sub-path such as GitHub Pages' /<repo>/.
 */
const MODEL_URL = `${import.meta.env.BASE_URL}models/cobot-arm.glb`;

const JOINT_MAP: Record<JointName, { scale: number; sign: number }> = {
  base: { scale: 1, sign: 1 },
  /* The two shoulder servos drive one axis; the model follows the first. */
  shoulder1: { scale: 1, sign: -1 },
  shoulder2: { scale: 1, sign: -1 },
  elbow: { scale: 1, sign: 1 },
  wrist: { scale: 1, sign: 1 },
  wristRotation: { scale: 1, sign: 1 },
  gripper: { scale: 0, sign: 1 },
};

export interface RobotModelProps {
  /** Show the floating joint readouts. */
  showReadouts?: boolean;
}

/**
 * The articulated robot.
 *
 * The joint transforms are written imperatively inside `useFrame` from the
 * robot store. React never re-renders this tree when the arm moves, so the
 * control loop can update the pose at 25 Hz without reconciling the scene.
 */
export function RobotModel({ showReadouts = false }: RobotModelProps) {
  const gltf = useGLTF(MODEL_URL);
  const selectedPart = useRobotStore((state) => state.selectedPart);
  const showLabels = useRobotStore((state) => state.showLabels);

  const turretRef = useRef<Group>(null);
  const shoulderRef = useRef<Group>(null);
  const elbowRef = useRef<Group>(null);
  const wristRef = useRef<Group>(null);
  const wristRollRef = useRef<Group>(null);
  const gripperRef = useRef<Group>(null);

  const partRefs = useRef(new Map<string, Group>());

  /**
   * A private copy of the loaded assembly.
   *
   * `useGLTF` caches one scene per URL, and mounting a node with R3F's
   * `<primitive>` detaches it from its parent — so the parts are cloned once
   * and addressed through a name map instead of by tree traversal.
   *
   * The geometry is faceted on the way in: the exporter welds the CAD's
   * vertices, which averages the normals and rounds off every chamfer and
   * fillet. Splitting them again puts the hard edges back.
   */
  const nodes = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const map = new Map<string, THREE.Object3D>();
    clone.traverse((object) => {
      if (object.name) map.set(object.name, object);
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.geometry = facetGeometry(mesh.geometry);
      }
    });
    return map;
  }, [gltf]);

  /** A second instance of a part, for the mirrored gripper finger. */
  const mirrorNodes = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    ["Parmak_X_2", "Parmak_2_X_2"].forEach((name) => {
      const source = nodes.get(name);
      if (!source) return;
      const copy = source.clone(true);
      copy.name = `${name}__mirror`;
      map.set(name, copy);
    });
    return map;
  }, [nodes]);

  /* Base materials, one instance per printed part family. */
  const materials = useMemo(() => {
    const created = {} as Record<MaterialId, MeshStandardMaterial>;
    (Object.keys(MATERIALS) as MaterialId[]).forEach((id) => {
      const spec = MATERIALS[id];
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.color),
        roughness: spec.roughness,
        metalness: spec.metalness,
        emissive: new THREE.Color(spec.emissive ?? "#000000"),
        emissiveIntensity: spec.emissiveIntensity ?? 0,
        envMapIntensity: spec.envMapIntensity ?? 1.1,
      });
      /* The CAD has no texture maps, so the surface detail is painted on in
         the shader: the layer lines a print leaves, a fine grain, and an
         edge light that keeps the silhouette off the background. */
      applySurfaceDetail(material, SURFACE[id]);
      created[id] = material;
    });
    return created;
  }, []);

  /* Highlight material for the selected component. */
  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#e8492c"),
        roughness: 0.38,
        metalness: 0.12,
        emissive: new THREE.Color("#61150a"),
        emissiveIntensity: 0.85,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((material) => material.dispose());
      highlightMaterial.dispose();
    };
  }, [materials, highlightMaterial]);

  /* Assign materials to every mesh of every part. */
  useEffect(() => {
    const apply = (object: THREE.Object3D, material: MeshStandardMaterial, partName: string) => {
      object.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.material = material;
        mesh.userData.partName = partName;
        mesh.userData.baseMaterial = material;
      });
    };

    PARTS.forEach((part) => {
      const node = nodes.get(part.name);
      if (!node) return;
      apply(node, materials[part.material], part.name);
    });
    mirrorNodes.forEach((node, name) => {
      const part = PARTS.find((entry) => entry.name === name);
      if (!part) return;
      apply(node, materials[part.material], part.name);
    });
  }, [nodes, mirrorNodes, materials]);

  /* Highlight / un-highlight the selected part. */
  useEffect(() => {
    const update = (object: THREE.Object3D, isSelected: boolean) => {
      object.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.material = isSelected
          ? highlightMaterial
          : (mesh.userData.baseMaterial as MeshStandardMaterial);
      });
    };
    PARTS.forEach((part) => {
      const node = nodes.get(part.name);
      if (node) update(node, selectedPart === part.name);
    });
  }, [selectedPart, nodes, highlightMaterial]);

  /* Exploded-view interpolation state. */
  const explodeTarget = useRef(0);

  useFrame((_, delta) => {
    const state = useRobotStore.getState();
    const angles = state.joints;
    const d = Math.min(delta, 0.05);

    /* --- joint transforms (single source of truth: the store) --- */
    const applyJoint = (
      ref: React.RefObject<Group>,
      joint: JointName,
      axis: "x" | "y" | "z",
    ) => {
      const group = ref.current;
      if (!group) return;
      const spec = JOINT_MAP[joint];
      const home = JOINTS[joint].home;
      const rest = REST_POSE[joint] ?? 0;
      /* The servo zero offset shifts the model's joint angle relative to the
         servo angle, so the view can be lined up with the real machine. */
      const zero = state.offsets[joint] ?? 0;
      const offset = (angles[joint] - home - zero) * spec.scale * spec.sign;
      const radians = THREE.MathUtils.degToRad(rest + offset);
      if (axis === "x") group.rotation.x = radians;
      if (axis === "y") group.rotation.y = radians;
      if (axis === "z") group.rotation.z = radians;
    };

    applyJoint(turretRef, "base", "y");
    applyJoint(shoulderRef, "shoulder1", "z");
    applyJoint(elbowRef, "elbow", "z");
    applyJoint(wristRef, "wrist", "z");
    applyJoint(wristRollRef, "wristRotation", "x");

    /* --- gripper: servo angle opens a pair of blades ---
       The end effector is linear and runs the other way round to the other
       axes: 0° is open, 180° is closed. */
    const grip = gripperRef.current;
    if (grip) {
      const spec = JOINTS.gripper;
      const t = THREE.MathUtils.clamp((angles.gripper - spec.min) / (spec.max - spec.min), 0, 1);
      /* The two blades pivot on a common pin, so the servo angle opens a
         V rather than sliding two carriages apart. */
      const half = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(24, 3, t));
      grip.children.forEach((child) => {
        const finger = child as Group;
        const side = finger.userData.side;
        if (side === 1) finger.rotation.y = -half;
        if (side === -1) finger.rotation.y = half;
      });
      /* Tell the camera where the tool is, so it can keep the arm in frame. */
      grip.getWorldPosition(toolAnchor);
    }

    /* --- exploded view --- */
    const target = state.exploded ? 1 : 0;
    explodeTarget.current = THREE.MathUtils.lerp(
      explodeTarget.current,
      target,
      1 - Math.pow(0.001, d),
    );
    const amount = explodeTarget.current;
    PARTS.forEach((part) => {
      const group = partRefs.current.get(part.name);
      if (!group) return;
      const offset = part.explode;
      group.position.set(
        part.position[0] + offset[0] * amount,
        part.position[1] + offset[1] * amount,
        part.position[2] + offset[2] * amount,
      );
    });
  });

  return (
    <group>
      <group scale={MM}>
        {/* static base */}
        <group>
          {PARTS.filter((p) => p.group === "base").map((part) => (
            <PartNode
              key={part.name}
              part={part}
              node={nodes.get(part.name)}
              register={(group) => partRefs.current.set(part.name, group)}
            />
          ))}
          {SERVOS.filter((s) => s.group === "base").map((servo) => (
            <ServoBody key={servo.id} servo={servo} />
          ))}
        </group>

        {/* J1 — base yaw */}
        <group ref={turretRef} position={PIVOTS.yaw}>
          {showReadouts && showLabels ? <JointReadout joint="base" position={[0, 40, 0]} /> : null}
          {PARTS.filter((p) => p.group === "turret").map((part) => (
            <PartNode
              key={part.name}
              part={part}
              node={nodes.get(part.name)}
              register={(group) => partRefs.current.set(part.name, group)}
            />
          ))}
          {SERVOS.filter((s) => s.group === "turret").map((servo) => (
            <ServoBody key={servo.id} servo={servo} />
          ))}

          {/* J2 — shoulder */}
          <group ref={shoulderRef} position={PIVOTS.shoulder}>
            {showReadouts && showLabels ? <JointReadout joint="shoulder1" position={[0, 0, 0]} /> : null}
            {PARTS.filter((p) => p.group === "upperArm").map((part) => (
              <PartNode
                key={part.name}
                part={part}
                node={nodes.get(part.name)}
                register={(group) => partRefs.current.set(part.name, group)}
              />
            ))}

            {/* J3 — elbow */}
            <group ref={elbowRef} position={PIVOTS.elbow}>
              {showReadouts && showLabels ? <JointReadout joint="elbow" position={[-40, 34, 0]} /> : null}
              {PARTS.filter((p) => p.group === "forearm").map((part) => (
                <PartNode
                  key={part.name}
                  part={part}
                  node={nodes.get(part.name)}
                  register={(group) => partRefs.current.set(part.name, group)}
                />
              ))}
              {SERVOS.filter((s) => s.group === "forearm").map((servo) => (
                <ServoBody key={servo.id} servo={servo} />
              ))}

              {/* J4 — wrist */}
              <group ref={wristRef} position={PIVOTS.wrist}>
                {showReadouts && showLabels ? <JointReadout joint="wrist" position={[-72, 0, 0]} /> : null}

                {/* J5 — wrist roll: the palm and the fingers turn about the
                    forearm axis, which is the sixth axis of the machine. */}
                <group ref={wristRollRef} position={PIVOTS.gripper}>
                  {showReadouts && showLabels ? (
                    <JointReadout joint="wristRotation" position={[0, 32, 0]} />
                  ) : null}
                  {PARTS.filter((p) => p.group === "wrist").map((part) => (
                    <PartNode
                      key={part.name}
                      part={part}
                      node={nodes.get(part.name)}
                      register={(group) => partRefs.current.set(part.name, group)}
                    />
                  ))}

                {/* J6 — gripper */}
                <group ref={gripperRef} position={PIVOTS.gripper}>
                  {showReadouts && showLabels ? (
                    <JointReadout joint="gripper" position={[0, -32, 0]} />
                  ) : null}
                  {PARTS.filter(
                    (p) => p.group === "gripper" && p.name === "Parmak_Disli_X_2",
                  ).map((part) => (
                    <PartNode
                      key={part.name}
                      part={part}
                      node={nodes.get(part.name)}
                      register={(group) => partRefs.current.set(part.name, group)}
                    />
                  ))}
                  <Finger
                    side={1}
                    carriage={nodes.get("Parmak_X_2")}
                    pad={nodes.get("Parmak_2_X_2")}
                  />
                  <Finger
                    side={-1}
                    carriage={mirrorNodes.get("Parmak_X_2")}
                    pad={mirrorNodes.get("Parmak_2_X_2")}
                  />
                </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

function PartNode({
  part,
  node,
  register,
}: {
  part: PartPlacement;
  node?: THREE.Object3D;
  register: (group: Group) => void;
}) {
  if (!node) return null;
  return (
    <group rotation={[0, part.yaw ?? 0, 0]}>
      <group
        position={part.position}
        rotation={part.rotation}
        ref={(group) => {
          if (group) register(group);
        }}
      >
        <primitive object={node} />
      </group>
    </group>
  );
}

/**
 * One blade of the two-finger gripper.
 *
 * The prototype's end effector is a pair of thin printed blades that pivot on
 * a common pin and open into a V, exactly as the reference photograph shows.
 *
 * The two blades are mirrored: the lower one is turned over so that its
 * working face points up while the upper blade's working face points down.
 * Without that flip both blades would face the same way and the pair could
 * only ever meet edge to edge instead of gripping.
 */
function Finger({
  side,
  carriage,
  pad,
}: {
  side: 1 | -1;
  carriage?: THREE.Object3D;
  pad?: THREE.Object3D;
}) {
  return (
    <group userData={{ side }}>
      {carriage ? (
        <group position={[-10, 0, 0]}>
          <primitive object={carriage} />
        </group>
      ) : null}
      {pad ? (
        side === 1 ? (
          /* Upper blade: working face down. */
          <group position={[5, 0, 8.1]} rotation={[Math.PI / 2, 0, 0]}>
            <primitive object={pad} />
          </group>
        ) : (
          /* Lower blade: turned over, working face up, 3 mm below the upper
             blade so the pair closes on a board. */
          <group position={[5, -3, -8.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <primitive object={pad} />
          </group>
        )
      ) : null}
    </group>
  );
}

/** A standard hobby servo, modelled procedurally. */
function ServoBody({ servo }: { servo: (typeof SERVOS)[number] }) {
  const [length, height, width] = servo.size;
  const bossSize = Math.min(width, 10) * 2.1;
  const rotation: [number, number, number] =
    servo.axis === "y"
      ? [-Math.PI / 2, 0, 0]
      : servo.axis === "x"
        ? [0, Math.PI / 2, 0]
        : servo.flip
          ? [0, Math.PI, 0]
          : [0, 0, 0];

  const bodyColor =
    servo.color === "metal" ? "#8b929c" : servo.color === "servo" ? "#343a43" : "#1d1f24";
  const bodyRough = servo.color === "metal" ? 0.3 : servo.color === "servo" ? 0.5 : 0.55;
  const bodyMetal = servo.color === "metal" ? 0.8 : servo.color === "servo" ? 0.14 : 0.22;

  return (
    <group position={servo.position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[length, height, width]} />
        <meshStandardMaterial color={bodyColor} roughness={bodyRough} metalness={bodyMetal} />
      </mesh>
      <mesh position={[0, -height / 2 - 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[length * 0.92, 6, width * 1.5]} />
        <meshStandardMaterial color={bodyColor} roughness={bodyRough} metalness={bodyMetal} />
      </mesh>
      <mesh position={[0, 0, width / 2 + 2.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[bossSize / 2, bossSize / 2, 5, 24]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.4} metalness={0.35} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One floating joint-angle readout.
 *
 * It lives inside the joint's own group, so it always sits on the axis it
 * describes no matter how the arm is posed. It polls the store on a slow
 * timer instead of subscribing, so the readouts never force a React render
 * of the 3D tree.
 */
function JointReadout({
  joint,
  position,
}: {
  joint: JointName;
  position: [number, number, number];
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setValue(useRobotStore.getState().joints[joint]);
    }, 120);
    return () => window.clearInterval(timer);
  }, [joint]);

  return (
    <Html
      position={position}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className="joint-readout">
        <span className="joint-readout__label">{joint.toUpperCase()}</span>
        <span className="joint-readout__value">{Math.round(value)}°</span>
      </div>
    </Html>
  );
}

useGLTF.preload(MODEL_URL);
