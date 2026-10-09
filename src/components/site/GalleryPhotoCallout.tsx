type PhotoCallout = {
  label: string;
  detail?: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

// Coordenadas relativas ao enquadramento original, compartilhado pelas três cores.
const callouts: readonly (readonly PhotoCallout[])[] = [
  [
    { label: "Lançador", x: 37, y: 8, targetX: 43, targetY: 31 },
    { label: "Visor incluso", x: 82, y: 8, targetX: 83, targetY: 29 },
    { label: "Bateria", x: 16, y: 94, targetX: 18, targetY: 66 },
    { label: "Cabo USB", x: 45, y: 94, targetX: 39, targetY: 72 },
    { label: "Tambor de água", x: 77, y: 94, targetX: 79, targetY: 66 },
  ],
  [
    { label: "Encaixes", x: 32, y: 10, targetX: 42, targetY: 33 },
    { label: "Gatilho", x: 24, y: 85, targetX: 51, targetY: 63 },
    { label: "Empunhadura", x: 70, y: 94, targetX: 83, targetY: 81 },
  ],
  [
    { label: "Luz LED frontal", detail: "Iluminação amarela", x: 35, y: 12, targetX: 18, targetY: 41 },
  ],
  [
    { label: "Diversão em família", detail: "Para brincar juntos", x: 51, y: 86, targetX: 31, targetY: 45 },
  ],
];

export function GalleryPhotoCallout({ photo }: { photo: number }) {
  const highlights = callouts[photo - 1];
  if (!highlights) return null;

  return (
    <div className="gallery-photo-annotations" id="gallery-photo-description">
      <svg className="gallery-photo-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {highlights.map((item) => <line key={item.label} x1={item.x} y1={item.y} x2={item.targetX} y2={item.targetY} />)}
      </svg>
      {highlights.map((item) => (
        <span key={item.label}>
          <span className="gallery-photo-target" style={{ left: `${item.targetX}%`, top: `${item.targetY}%` }} aria-hidden="true" />
          <span className="gallery-photo-callout" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
            <strong>{item.label}</strong>
            {item.detail && <span>{item.detail}</span>}
          </span>
        </span>
      ))}
    </div>
  );
}
