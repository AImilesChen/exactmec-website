import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./redesign.css";
import "./compositions.css";
import "./v3.css";
import "./home-v2.css";
import "./products.css";
import "./core-mold.css";
import "./quotation-guide.css";
import "./design-review.css";
import "./motor-industry.css";
import "./led-industry.css";
import "./automotive-industry.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
