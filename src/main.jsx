import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FacialAnalysisApp from "./aesthetica";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FacialAnalysisApp />
  </StrictMode>
);
