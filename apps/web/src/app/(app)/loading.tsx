export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <div className="loading-header" aria-hidden="true">
        <div className="skeleton loading-title" />
        <div className="skeleton loading-description" />
      </div>
      <div className="card" aria-hidden="true">
        <div className="skeleton loading-card" />
      </div>
      <div className="card" aria-hidden="true">
        <div className="skeleton loading-card" />
      </div>
    </div>
  );
}
