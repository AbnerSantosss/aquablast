"use client";

import { ResponsiveFunnel, type FunnelDatum } from "@nivo/funnel";

export interface FunnelStage {
  id: string;
  label: string;
  value: number;
}

/**
 * Desenho do "Funil da operação" (pedido do dono, 2026-09-30: "o funil literalmente tem que ter um
 * formato de um funil"). Horizontal, uma faixa por etapa, na mesma ordem e largura dos cards de cima
 * (spacing = gap de 1.5rem do .op-steps, assim cada faixa fica embaixo do seu card no desktop).
 * Azul escuro -> azul da marca, a última (compraram) no verde; todas com 4.5:1 ou mais contra o
 * número branco dentro da faixa.
 */
const COLORS = ["#032644", "#063760", "#004f93", "#0061b5", "#006bca", "#087e3a"];

export function OperationFunnelChart({ stages }: { stages: FunnelStage[] }) {
  const data: FunnelDatum[] = stages.map((s) => ({ id: s.id, label: s.label, value: s.value }));
  return (
    <div className="op-funnel-chart" role="img" aria-label={stages.map((s) => `${s.label}: ${s.value}`).join(", ")}>
      <ResponsiveFunnel
        data={data}
        direction="horizontal"
        interpolation="smooth"
        shapeBlending={0.66}
        spacing={24}
        margin={{ top: 6, right: 0, bottom: 6, left: 0 }}
        colors={COLORS}
        fillOpacity={1}
        borderWidth={0}
        enableLabel
        labelColor="#ffffff"
        enableBeforeSeparators={false}
        enableAfterSeparators={false}
        currentPartSizeExtension={6}
        motionConfig="gentle"
        theme={{
          text: { fontFamily: "Nunito, system-ui, sans-serif", fontSize: 14, fontWeight: 800 },
          // No modo horizontal o nivo 0.99 desenha os separadores mesmo com enable*Separators=false.
          grid: { line: { stroke: "transparent", strokeWidth: 0 } },
          tooltip: { container: { borderRadius: 10, fontSize: 13 } },
        }}
        tooltip={({ part }) => (
          <div className="op-funnel-tip">
            <strong>{part.data.label}</strong>
            <span>{part.data.value}</span>
          </div>
        )}
      />
    </div>
  );
}
