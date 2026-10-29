import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../design/Icon.tsx";

export interface Action {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}

/** Layout of one wizard step: title, body, and the actions at the bottom. */
export function StepFrame({ title, children, primary, secondary, onBack }: {
  title: string;
  children: ReactNode;
  primary?: Action;
  secondary?: Action;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="step">
      <h2 className="step-title">{title}</h2>
      <div className="step-body">{children}</div>
      <footer className="step-actions">
        {onBack && (
          <button className="btn ghost" onClick={onBack} data-testid="wizard-back">
            <Icon name="arrowLeft" size={16} />{t("common.back")}
          </button>
        )}
        <span className="spacer" />
        {secondary && (
          <button className="btn ghost" onClick={secondary.onClick} disabled={secondary.disabled} data-testid={secondary.testId ?? "wizard-secondary"}>
            {secondary.label}
          </button>
        )}
        {primary && (
          <button className="btn primary" onClick={primary.onClick} disabled={primary.disabled} data-testid={primary.testId ?? "wizard-next"}>
            {primary.label}
          </button>
        )}
      </footer>
    </div>
  );
}

/** A live check row: ok / problem / waiting. */
export function CheckRow({ state, label, detail }: { state: "ok" | "bad" | "wait"; label: string; detail?: string }) {
  return (
    <div className="check-row" data-state={state}>
      <span className="check-icon">
        {state === "ok" ? <Icon name="check" size={16} /> : state === "bad" ? <Icon name="warning" size={16} /> : <span className="spinner" />}
      </span>
      <div>
        <div className="check-label">{label}</div>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
