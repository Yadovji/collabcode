import React from "react";
import ReactDOM from "react-dom/client";
import { loader } from "@monaco-editor/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProviderRoot } from "./auth";
import "./styles.css";

const monacoBaseUrl = new URL(`${import.meta.env.BASE_URL}monaco/`, window.location.href).toString();
const monacoVsPath = new URL(`${import.meta.env.BASE_URL}monaco/vs`, window.location.href).toString();
Object.assign(window, { MonacoEnvironment: { baseUrl: monacoBaseUrl } });
loader.config({ paths: { vs: monacoVsPath } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter><AuthProviderRoot><App /></AuthProviderRoot></BrowserRouter>
);
