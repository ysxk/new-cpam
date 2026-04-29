import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AmpCode from "./pages/AmpCode";
import ApiCallTool from "./pages/ApiCallTool";
import ApiKeys from "./pages/ApiKeys";
import AuthFiles from "./pages/AuthFiles";
import ConfigPage from "./pages/ConfigPage";
import Dashboard from "./pages/Dashboard";
import Logs from "./pages/Logs";
import Models from "./pages/Models";
import OAuthLogin from "./pages/OAuthLogin";
import Providers from "./pages/Providers";
import Quota from "./pages/Quota";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/ampcode" element={<AmpCode />} />
        <Route path="/keys" element={<ApiKeys />} />
        <Route path="/auth-files" element={<AuthFiles />} />
        <Route path="/models" element={<Models />} />
        <Route path="/api-call" element={<ApiCallTool />} />
        <Route path="/oauth" element={<OAuthLogin />} />
        <Route path="/quota" element={<Quota />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
