import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import RouteMetadata from "./seo/RouteMetadata.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <RouteMetadata />
      <App />
    </BrowserRouter>
  </StrictMode>
);
