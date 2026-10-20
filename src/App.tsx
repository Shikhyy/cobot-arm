import { Route, Routes } from "react-router-dom";

import { LandingPage } from "./pages/LandingPage";
import { ControlPage } from "./pages/ControlPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
