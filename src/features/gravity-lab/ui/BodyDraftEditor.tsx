"use client";

import { memo, type Dispatch, type ReactNode } from "react";

import {
  type DraftNumber,
  type ScenarioDraft,
  type ScenarioValidationReport,
} from "../core/scenario";
import type {
  DistanceUnit,
  MassUnit,
  SpeedUnit,
} from "../core/units";
import {
  bodyColorError,
  bodyNameError,
  type DraftDistanceField,
  type DraftNumericField,
  type DraftSpeedField,
  type GravityLabAction,
} from "./gravityLabReducer";
import { diagnosticMessageFr } from "./gravityLabPresentation";

const MASS_UNITS: readonly MassUnit[] = [
  "kg",
  "earth-mass",
  "jupiter-mass",
  "solar-mass",
];
const DISTANCE_UNITS: readonly DistanceUnit[] = [
  "m",
  "km",
  "au",
  "earth-radius",
  "jupiter-radius",
  "solar-radius",
];
const SPEED_UNITS: readonly SpeedUnit[] = ["m/s", "km/s"];

type NumberEditorProps<Unit extends string> = Readonly<{
  id: string;
  label: string;
  field: DraftNumber<Unit>;
  units: readonly Unit[];
  onRawText: (rawText: string) => void;
  onUnit: (unit: Unit) => void;
}>;

function NumberEditor<Unit extends string>({
  id,
  label,
  field,
  units,
  onRawText,
  onUnit,
}: NumberEditorProps<Unit>) {
  const errorId = `${id}-errors`;
  const hasErrors = field.errors.length > 0;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground/85">
        {label}
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={field.rawText}
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
          onChange={(event) => onRawText(event.target.value)}
          className="min-w-0 rounded-md border border-border/60 bg-background/55 px-2 py-1.5 font-mono text-xs shadow-inner shadow-black/5 transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-destructive motion-reduce:transition-none"
        />
        <select
          aria-label={`Unité — ${label}`}
          value={field.unit}
          onChange={(event) => onUnit(event.target.value as Unit)}
          className="min-w-0 rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5 text-xs transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary motion-reduce:transition-none"
        >
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      {hasErrors ? (
        <ul id={errorId} className="space-y-0.5 text-xs text-destructive">
          {field.errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>
              {diagnosticMessageFr(error)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EditorSection({
  title,
  defaultOpen = false,
  children,
}: Readonly<{
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}>) {
  return (
    <details
      open={defaultOpen}
      className="group min-w-0 border-b border-border/50"
    >
      <summary className="cursor-pointer list-none px-1 py-2.5 text-sm font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{title}</span>
          <span
            aria-hidden="true"
            className="text-base text-muted-foreground transition-transform group-open:rotate-45 motion-reduce:transition-none"
          >
            +
          </span>
        </span>
      </summary>
      <div className="min-w-0 space-y-3 border-t border-border/35 px-1 py-3">
        {children}
      </div>
    </details>
  );
}

export type BodyDraftEditorProps = Readonly<{
  draft: ScenarioDraft;
  validationReport: ScenarioValidationReport;
  selectedBodyId: string;
  dispatch: Dispatch<GravityLabAction>;
}>;

export const BodyDraftEditor = memo(function BodyDraftEditor({
  draft,
  validationReport,
  selectedBodyId,
  dispatch,
}: BodyDraftEditorProps) {
  const bodyIndex = draft.bodies.findIndex(
    ({ id }) => id === selectedBodyId
  );

  if (bodyIndex === -1) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive"
      >
        Aucun corps du brouillon n’est sélectionné. Sélectionnez un corps
        dans la liste pour poursuivre l’édition.
      </p>
    );
  }

  const body = validationReport.analyzedDraft.bodies[bodyIndex];
  const prefix = `draft-body-${bodyIndex}`;
  const nameError = bodyNameError(body.name);
  const colorError = bodyColorError(body.color);
  const editRaw = (field: DraftNumericField, rawText: string) =>
    dispatch({
      type: "edit-number-raw",
      bodyId: body.id,
      field,
      rawText,
    });
  const changeDistanceUnit = (
    field: DraftDistanceField,
    unit: DistanceUnit
  ) =>
    dispatch({
      type: "change-distance-unit",
      bodyId: body.id,
      field,
      unit,
    });
  const changeSpeedUnit = (
    field: DraftSpeedField,
    unit: SpeedUnit
  ) =>
    dispatch({
      type: "change-speed-unit",
      bodyId: body.id,
      field,
      unit,
    });

  return (
    <section
      aria-labelledby={`${prefix}-editor-title`}
      className="mt-4 min-w-0 space-y-1 border-t border-border/55 pt-4"
    >
      <h4
        id={`${prefix}-editor-title`}
        className="mb-2 truncate text-sm font-semibold tracking-tight text-primary/85"
      >
        Modifier {body.name.trim() || body.id}
      </h4>

      <EditorSection title="Général" defaultOpen>
        <div className="space-y-1">
          <span className="text-xs font-medium">Identifiant technique</span>
          <output
            aria-label="Identifiant technique"
            className="block break-all rounded-md border border-border/45 bg-muted/25 px-2 py-1.5 font-mono text-xs text-foreground/80"
          >
            {body.id}
          </output>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${prefix}-name`} className="text-xs font-medium">
            Nom
          </label>
          <input
            id={`${prefix}-name`}
            type="text"
            value={body.name}
            aria-invalid={nameError !== null}
            aria-describedby={
              nameError === null ? undefined : `${prefix}-name-error`
            }
            onChange={(event) =>
              dispatch({
                type: "edit-body-name",
                bodyId: body.id,
                name: event.target.value,
              })
            }
            className="w-full rounded-md border border-border/60 bg-background/55 px-2 py-1.5 text-sm shadow-inner shadow-black/5 transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-destructive motion-reduce:transition-none"
          />
          {nameError === null ? null : (
            <p id={`${prefix}-name-error`} className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor={`${prefix}-color`} className="text-xs font-medium">
            Couleur
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2">
            <input
              id={`${prefix}-color`}
              type="text"
              value={body.color}
              aria-invalid={colorError !== null}
              aria-describedby={
                colorError === null ? undefined : `${prefix}-color-error`
              }
              onChange={(event) =>
                dispatch({
                  type: "edit-body-color",
                  bodyId: body.id,
                  color: event.target.value,
                })
              }
              className="min-w-0 rounded-md border border-border/60 bg-background/55 px-2 py-1.5 font-mono text-xs shadow-inner shadow-black/5 transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-destructive motion-reduce:transition-none"
            />
            <span
              aria-hidden="true"
              className="rounded-md border border-border/60 shadow-inner shadow-black/10"
              style={{
                backgroundColor:
                  colorError === null ? body.color : "transparent",
              }}
            />
          </div>
          {colorError === null ? null : (
            <p id={`${prefix}-color-error`} className="text-xs text-destructive">
              {colorError}
            </p>
          )}
        </div>
      </EditorSection>

      <EditorSection title="Propriétés physiques" defaultOpen>
        <NumberEditor
          id={`${prefix}-mass`}
          label="Masse"
          field={body.mass}
          units={MASS_UNITS}
          onRawText={(rawText) => editRaw("mass", rawText)}
          onUnit={(unit) =>
            dispatch({
              type: "change-mass-unit",
              bodyId: body.id,
              unit,
            })
          }
        />
        <NumberEditor
          id={`${prefix}-radius`}
          label="Rayon physique"
          field={body.physicalRadius}
          units={DISTANCE_UNITS}
          onRawText={(rawText) =>
            editRaw("physicalRadius", rawText)
          }
          onUnit={(unit) =>
            changeDistanceUnit("physicalRadius", unit)
          }
        />
        <fieldset className="min-w-0 space-y-2 border-t border-border/45 pt-3">
          <legend className="px-1 text-xs font-semibold">Mobilité</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefix}-mobility`}
              checked={!body.fixed}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onChange={() =>
                dispatch({
                  type: "set-body-fixed",
                  bodyId: body.id,
                  fixed: false,
                })
              }
            />
            Mobile
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefix}-mobility`}
              checked={body.fixed}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onChange={() =>
                dispatch({
                  type: "set-body-fixed",
                  bodyId: body.id,
                  fixed: true,
                })
              }
            />
            Fixe
          </label>
        </fieldset>
      </EditorSection>

      <EditorSection title="Position initiale">
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberEditor
            key={axis}
            id={`${prefix}-position-${axis}`}
            label={axis.toUpperCase()}
            field={body.initialPosition[axis]}
            units={DISTANCE_UNITS}
            onRawText={(rawText) =>
              editRaw(`position-${axis}`, rawText)
            }
            onUnit={(unit) =>
              changeDistanceUnit(`position-${axis}`, unit)
            }
          />
        ))}
      </EditorSection>

      <EditorSection title="Vitesse initiale">
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberEditor
            key={axis}
            id={`${prefix}-velocity-${axis}`}
            label={`V${axis}`}
            field={body.initialVelocity[axis]}
            units={SPEED_UNITS}
            onRawText={(rawText) =>
              editRaw(`velocity-${axis}`, rawText)
            }
            onUnit={(unit) =>
              changeSpeedUnit(`velocity-${axis}`, unit)
            }
          />
        ))}
      </EditorSection>
    </section>
  );
});
