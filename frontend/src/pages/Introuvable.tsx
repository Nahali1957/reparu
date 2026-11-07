import { Link } from "react-router-dom";

export default function Introuvable() {
  return (
    <div className="card" style={{ padding: "48px 28px", textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <span className="mono" style={{ fontSize: 13, color: "var(--c-primary)" }}>404</span>
      <h2 style={{ margin: 0, fontSize: 18 }}>Cette page n'existe pas</h2>
      <p data-muted="1" style={{ margin: 0, fontSize: 13.5, color: "var(--c-muted)" }}>Le lien est peut-être erroné ou la page a été déplacée.</p>
      <Link to="/" className="btn btn-primary">Revenir à l'accueil</Link>
    </div>
  );
}
