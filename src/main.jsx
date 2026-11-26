import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import LocationCatalogLoader from "./data/LocationCatalogLoader.jsx";
import App from "./App.jsx";
import RouteMetadata from "./seo/RouteMetadata.jsx";
import AnalyticsRoute from './analytics/AnalyticsRoute.jsx';
import { installGoogleTagManager } from './analytics/googleTagManager.js';

const disposeTagManager=installGoogleTagManager({win:window,doc:document,enabled:import.meta.env.PROD});
if(import.meta.hot)import.meta.hot.dispose(disposeTagManager);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsRoute />
      <LocationCatalogLoader />
      <RouteMetadata />
      <App />
    </BrowserRouter>
  </StrictMode>
);
