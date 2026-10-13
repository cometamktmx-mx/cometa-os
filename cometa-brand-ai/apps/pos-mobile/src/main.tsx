import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { BetaLinkBoundary } from "./BetaLinkBoundary";
const root = document.getElementById("root");
if (root) createRoot(root).render(<BetaLinkBoundary><App/></BetaLinkBoundary>);
