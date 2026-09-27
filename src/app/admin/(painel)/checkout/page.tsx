import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveRecoverySettings, saveThemeSettings } from "@/lib/admin/actions/checkout";
import { getSetting, getSettings } from "@/lib/settings";
import { contrastRatio, isoToLocalInput, themeSchema, themeVars } from "@/lib/checkout/own/theme";

export const metadata = { title: "Personalizar checkout | Painel AquaBlast" };

const MIN_CONTRAST = 4.5;

export default async function PersonalizarCheckoutPage() {
  await requireAdmin();
  const storedTheme = await getSetting("checkout.theme");
  const parsed = themeSchema.safeParse(storedTheme);
  const theme = parsed.success ? parsed.data : themeSchema.parse({});
  const recovery = await getSettings([
    "checkout.recovery.enabled",
    "checkout.recovery.firstAfterMinutes",
    "checkout.recovery.secondAfterMinutes",
    "checkout.recovery.thirdAfterMinutes",
  ] as const);

  const buttonContrast = contrastRatio(theme.colorButton, "#ffffff") >= MIN_CONTRAST || contrastRatio(theme.colorButton, "#0b1f33") >= MIN_CONTRAST;
  const primaryContrast = contrastRatio(theme.colorPrimary, "#ffffff") >= MIN_CONTRAST || contrastRatio(theme.colorPrimary, "#0b1f33") >= MIN_CONTRAST;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Personalizar checkout</h1>
        <p className="muted">Aparência, textos e recuperação de carrinho abandonado da tela /checkout.</p>
      </div>

      <div className="cols-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Aparência e textos</h2>
            </div>
            <ActionForm action={saveThemeSettings}>
              <label className="field">
                <span>Nome da loja</span>
                <input name="storeName" defaultValue={theme.storeName} maxLength={40} required />
              </label>
              <label className="field">
                <span>Logotipo (caminho local ou https://)</span>
                <input name="logoUrl" defaultValue={theme.logoUrl} maxLength={500} placeholder="/checkout/logo.webp" />
              </label>

              <h3 className="small" style={{ marginTop: "0.75rem" }}>
                Cores
              </h3>
              <div className="grid-2">
                <label className="field color-field" data-color-field>
                  <span>Principal</span>
                  <input type="color" defaultValue={theme.colorPrimary} data-color-picker tabIndex={-1} aria-hidden="true" />
                  <input name="colorPrimary" defaultValue={theme.colorPrimary} maxLength={7} data-color-text />
                </label>
                <label className="field color-field" data-color-field>
                  <span>Botão</span>
                  <input type="color" defaultValue={theme.colorButton} data-color-picker tabIndex={-1} aria-hidden="true" />
                  <input name="colorButton" defaultValue={theme.colorButton} maxLength={7} data-color-text />
                </label>
                <label className="field color-field" data-color-field>
                  <span>Destaque</span>
                  <input type="color" defaultValue={theme.colorAccent} data-color-picker tabIndex={-1} aria-hidden="true" />
                  <input name="colorAccent" defaultValue={theme.colorAccent} maxLength={7} data-color-text />
                </label>
                <label className="field color-field" data-color-field>
                  <span>Cronômetro</span>
                  <input type="color" defaultValue={theme.colorTimer} data-color-picker tabIndex={-1} aria-hidden="true" />
                  <input name="colorTimer" defaultValue={theme.colorTimer} maxLength={7} data-color-text />
                </label>
                <label className="field color-field" data-color-field>
                  <span>Fundo</span>
                  <input type="color" defaultValue={theme.colorBackground} data-color-picker tabIndex={-1} aria-hidden="true" />
                  <input name="colorBackground" defaultValue={theme.colorBackground} maxLength={7} data-color-text />
                </label>
              </div>
              <script
                // Sincroniza o seletor de cor (decorativo, sem name) com o campo de texto (com name, é o que é
                // salvo). Só liga o color picker ao texto — não precisa de "use client" nem de estado React.
                dangerouslySetInnerHTML={{
                  __html: `document.querySelectorAll('[data-color-field]').forEach(function(f){var p=f.querySelector('[data-color-picker]'),t=f.querySelector('[data-color-text]');if(!p||!t)return;p.addEventListener('input',function(){t.value=p.value;});t.addEventListener('input',function(){if(/^#[0-9a-fA-F]{6}$/.test(t.value))p.value=t.value;});});`,
                }}
              />
              {!primaryContrast ? <p className="contrast-warn">Contraste baixo entre a cor principal e o texto — pode ficar difícil de ler.</p> : null}
              {!buttonContrast ? <p className="contrast-warn">Contraste baixo entre a cor do botão e o texto — pode ficar difícil de ler.</p> : null}

              <h3 className="small" style={{ marginTop: "0.75rem" }}>
                Cronômetro
              </h3>
              <label className="check">
                <input type="checkbox" name="timerEnabled" defaultChecked={theme.timerEnabled} />
                <span>Mostrar cronômetro</span>
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Texto do cronômetro</span>
                  <input name="timerLabel" defaultValue={theme.timerLabel} maxLength={80} />
                </label>
                <label className="field">
                  <span>Fim da oferta (horário de Brasília)</span>
                  <input name="timerEnd" type="datetime-local" step={1} defaultValue={isoToLocalInput(theme.timerEnd)} />
                </label>
              </div>

              <h3 className="small" style={{ marginTop: "0.75rem" }}>
                Faixa de frete
              </h3>
              <label className="check">
                <input type="checkbox" name="shipBarEnabled" defaultChecked={theme.shipBarEnabled} />
                <span>Mostrar faixa de frete</span>
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Texto</span>
                  <input name="shipBarText" defaultValue={theme.shipBarText} maxLength={80} />
                </label>
                <label className="field">
                  <span>Observação</span>
                  <input name="shipBarNote" defaultValue={theme.shipBarNote} maxLength={100} />
                </label>
              </div>

              <h3 className="small" style={{ marginTop: "0.75rem" }}>
                Banner
              </h3>
              <label className="check">
                <input type="checkbox" name="bannerEnabled" defaultChecked={theme.bannerEnabled} />
                <span>Mostrar banner</span>
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Chamada</span>
                  <input name="bannerEyebrow" defaultValue={theme.bannerEyebrow} maxLength={40} />
                </label>
                <label className="field">
                  <span>Título</span>
                  <input name="bannerTitle" defaultValue={theme.bannerTitle} maxLength={80} />
                </label>
                <label className="field span-2">
                  <span>Subtítulo</span>
                  <input name="bannerSubtitle" defaultValue={theme.bannerSubtitle} maxLength={120} />
                </label>
                <label className="field span-2">
                  <span>Imagem (caminho local ou https://)</span>
                  <input name="bannerImage" defaultValue={theme.bannerImage} maxLength={500} required />
                </label>
              </div>

              <h3 className="small" style={{ marginTop: "0.75rem" }}>
                Botão e rodapé
              </h3>
              <div className="grid-2">
                <label className="field">
                  <span>Texto do botão</span>
                  <input name="buttonLabel" defaultValue={theme.buttonLabel} maxLength={30} required />
                </label>
                <label className="field">
                  <span>Selo da etapa</span>
                  <input name="badgeText" defaultValue={theme.badgeText} maxLength={30} />
                </label>
                <label className="field span-2">
                  <span>Texto do rodapé</span>
                  <input name="footerText" defaultValue={theme.footerText} maxLength={120} />
                </label>
              </div>

              <button className="btn" type="submit" style={{ marginTop: "0.75rem" }}>
                Salvar aparência
              </button>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Recuperação de carrinho abandonado</h2>
            </div>
            <ActionForm action={saveRecoverySettings}>
              <label className="check">
                <input type="checkbox" name="checkout.recovery.enabled" defaultChecked={recovery["checkout.recovery.enabled"]} />
                <span>Enviar e-mails de recuperação</span>
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>1º lembrete (minutos)</span>
                  <input name="checkout.recovery.firstAfterMinutes" type="number" min={1} defaultValue={recovery["checkout.recovery.firstAfterMinutes"]} />
                </label>
                <label className="field">
                  <span>2º lembrete (minutos)</span>
                  <input name="checkout.recovery.secondAfterMinutes" type="number" min={1} defaultValue={recovery["checkout.recovery.secondAfterMinutes"]} />
                </label>
                <label className="field">
                  <span>3º lembrete (minutos)</span>
                  <input name="checkout.recovery.thirdAfterMinutes" type="number" min={1} defaultValue={recovery["checkout.recovery.thirdAfterMinutes"]} />
                </label>
              </div>
              <p className="small muted">Os prazos precisam ser crescentes (1º &lt; 2º &lt; 3º).</p>
              <button className="btn" type="submit">
                Salvar recuperação
              </button>
            </ActionForm>
          </section>
        </div>

        <div className="ca-preview-wrap">
          <div className="ca-preview" style={themeVars(theme)}>
            <div className="ca-preview-head">{theme.storeName}</div>
            {theme.timerEnabled ? <div className="ca-preview-timer">{theme.timerLabel}</div> : null}
            {theme.shipBarEnabled ? (
              <div className="ca-preview-ship">
                {theme.shipBarText} — {theme.shipBarNote}
              </div>
            ) : null}
            {theme.bannerEnabled ? (
              <div className="ca-preview-banner">
                <span className="eyebrow">{theme.bannerEyebrow}</span>
                <h4>{theme.bannerTitle}</h4>
                <p>{theme.bannerSubtitle}</p>
              </div>
            ) : null}
            <div className="ca-preview-body">
              <button type="button" className="ca-preview-btn" disabled>
                {theme.buttonLabel}
              </button>
              {theme.badgeText ? <span className="ca-preview-badge">{theme.badgeText}</span> : null}
            </div>
            <div className="ca-preview-footer">{theme.footerText}</div>
          </div>
          <p className="small muted" style={{ marginTop: "0.5rem" }}>
            Pré-visualização estática (sem JavaScript) — para ver como ficou salvo, sem enviar o formulário. Alterações nos
            campos só aparecem aqui depois de salvar.
          </p>
        </div>
      </div>
    </div>
  );
}
