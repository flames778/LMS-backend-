export default function HomePage() {
  return (
    <main style={{ padding: "3rem", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h1>NUTM Learn Backend API</h1>
      <p>Institutional Learning Management System for the Nigerian University of Technology and Management (NUTM).</p>
      <ul>
        <li><a href="/api/v1/health/live">Health Liveness Check (/api/v1/health/live)</a></li>
        <li><a href="/api/v1/health/ready">Health Readiness Check (/api/v1/health/ready)</a></li>
      </ul>
      <p style={{ marginTop: "2rem", color: "#666" }}>
        Microsoft Entra ID authentication and IT Admin approvals required for institutional access.
      </p>
    </main>
  );
}
