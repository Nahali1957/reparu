import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { A11yProvider } from "./hooks/useA11y";
import { AuthProvider } from "./hooks/useAuth";
import { ToastProvider } from "./hooks/useToast";
import "./styles/tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <A11yProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </A11yProvider>
  </React.StrictMode>,
);
