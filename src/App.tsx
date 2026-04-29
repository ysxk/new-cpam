import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ApiKeys from "./pages/ApiKeys";
import AuthFiles from "./pages/AuthFiles";
import ConfigPage from "./pages/ConfigPage";
import Dashboard from "./pages/Dashboard";
import Logs from "./pages/Logs";
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
        <Route path="/keys" element={<ApiKeys />} />
        <Route path="/auth-files" element={<AuthFiles />} />
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
