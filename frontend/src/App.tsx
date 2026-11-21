import { Navigate, Route, Routes } from "react-router"
import MainLayout from "@/layouts/MainLayout"
import Dashboard from "@/pages/Dashboard"

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default App
