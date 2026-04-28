import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import ReleaseList from "./pages/release/ReleaseList";
import ReleaseCreate from "./pages/release/ReleaseCreate";
import ReleaseDetail from "./pages/release/ReleaseDetail";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/releases" element={<ReleaseList />} />
        <Route path="/releases/create" element={<ReleaseCreate />} />
        <Route path="/releases/:id" element={<ReleaseDetail />} />
      </Route>
    </Routes>
  );
}
