"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const WIDE_WORKSPACE_QUERY = "(min-width: 1888px)";

export type InspectorSide = "left" | "right";

export type GravityWorkspaceInspectorVisibility = Readonly<{
  leftOpen: boolean;
  rightOpen: boolean;
}>;

const GRAVITY_WORKSPACE_CENTER_CLASS_NAME =
  "min-w-0 min-[1888px]:col-start-2 min-[1888px]:row-start-1";

export function getGravityWorkspaceCenterClassName(
  visibility: GravityWorkspaceInspectorVisibility
): string {
  void visibility;
  return GRAVITY_WORKSPACE_CENTER_CLASS_NAME;
}

export function getGravityWorkspaceInspectorPlacement(
  side: InspectorSide
): string {
  return side === "left"
    ? "min-[1888px]:left-4! min-[1888px]:right-auto!"
    : "min-[1888px]:left-auto! min-[1888px]:right-4!";
}

type GravityLabWorkspaceContextValue = Readonly<{
  leftOpen: boolean;
  rightOpen: boolean;
  openInspector: (side: InspectorSide) => void;
  closeInspector: (side: InspectorSide) => void;
}>;

const GravityLabWorkspaceContext =
  createContext<GravityLabWorkspaceContextValue | null>(null);

function useGravityLabWorkspace() {
  const context = useContext(GravityLabWorkspaceContext);

  if (context === null) {
    throw new Error(
      "Les panneaux du Gravity Lab doivent être placés dans GravityLabWorkspace."
    );
  }

  return context;
}

export type GravityLabWorkspaceProps = Readonly<{
  children: ReactNode;
}>;

export function GravityLabWorkspace({
  children,
}: GravityLabWorkspaceProps) {
  const [isWide, setIsWide] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(WIDE_WORKSPACE_QUERY);
    const synchronizeWithViewport = (matches: boolean) => {
      setIsWide(matches);
      setLeftOpen(matches);
      setRightOpen(matches);
    };
    const handleViewportChange = (event: MediaQueryListEvent) =>
      synchronizeWithViewport(event.matches);

    synchronizeWithViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  const openInspector = (side: InspectorSide) => {
    if (side === "left") {
      setLeftOpen(true);
      if (!isWide) {
        setRightOpen(false);
      }
    } else {
      setRightOpen(true);
      if (!isWide) {
        setLeftOpen(false);
      }
    }
  };

  const closeInspector = (side: InspectorSide) => {
    if (side === "left") {
      setLeftOpen(false);
    } else {
      setRightOpen(false);
    }
  };

  const context: GravityLabWorkspaceContextValue = {
    leftOpen,
    rightOpen,
    openInspector,
    closeInspector,
  };

  return (
    <GravityLabWorkspaceContext.Provider value={context}>
      <div className="grid w-full grid-cols-1 items-start gap-4 min-[1888px]:ml-[calc(50%_-_50vw_+_1rem)] min-[1888px]:w-[calc(100vw-2rem)] min-[1888px]:grid-cols-[minmax(22.5rem,1fr)_minmax(0,69rem)_minmax(22.5rem,1fr)]">
        {children}
      </div>
    </GravityLabWorkspaceContext.Provider>
  );
}

export type GravityWorkspaceMainProps = Readonly<{
  children: ReactNode;
}>;

export function GravityWorkspaceMain({ children }: GravityWorkspaceMainProps) {
  const { leftOpen, rightOpen } = useGravityLabWorkspace();

  return (
    <div
      className={getGravityWorkspaceCenterClassName({
        leftOpen,
        rightOpen,
      })}
    >
      {children}
    </div>
  );
}

export function GravityWorkspaceDiagnostics({
  children,
}: GravityWorkspaceMainProps) {
  return (
    <div className="min-w-0 min-[1888px]:col-start-2 min-[1888px]:row-start-2">
      {children}
    </div>
  );
}

export type GravityWorkspaceInspectorProps = Readonly<{
  side: InspectorSide;
  eyebrow: string;
  title: string;
  compactLabel: string;
  children: ReactNode;
}>;

export function GravityWorkspaceInspector({
  side,
  eyebrow,
  title,
  compactLabel,
  children,
}: GravityWorkspaceInspectorProps) {
  const titleId = useId();
  const panelId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusCloseButtonOnOpen = useRef(false);
  const {
    leftOpen,
    rightOpen,
    openInspector,
    closeInspector,
  } = useGravityLabWorkspace();
  const open = side === "left" ? leftOpen : rightOpen;

  useEffect(() => {
    if (!open || !focusCloseButtonOnOpen.current) {
      return;
    }

    focusCloseButtonOnOpen.current = false;
    closeButtonRef.current?.focus();
  }, [open]);

  const handleOpen = () => {
    focusCloseButtonOnOpen.current = true;
    openInspector(side);
  };
  const handleClose = () => {
    closeInspector(side);
    requestAnimationFrame(() => openButtonRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
    }
  };
  const placement = getGravityWorkspaceInspectorPlacement(side);
  const mobilePlacement =
    side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4";

  if (!open) {
    return (
      <div className={`fixed bottom-2 z-40 min-[1888px]:bottom-auto min-[1888px]:top-4 ${mobilePlacement} ${placement}`}>
        <button
          ref={openButtonRef}
          type="button"
          aria-label={`Ouvrir ${title}`}
          aria-expanded="false"
          aria-controls={panelId}
          onClick={handleOpen}
          className="max-w-[calc(50vw-1rem)] rounded-full border border-primary/60 bg-card/95 px-3 py-2 text-sm font-semibold text-foreground shadow-xl shadow-black/20 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-[1888px]:max-w-none"
        >
          {compactLabel}
        </button>
      </div>
    );
  }

  return (
    <aside
      id={panelId}
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      className={`fixed inset-x-2 bottom-2 z-50 flex h-[80svh] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl shadow-black/30 backdrop-blur sm:inset-x-4 min-[1888px]:inset-y-4 min-[1888px]:h-auto min-[1888px]:w-[22.5rem] min-[1888px]:max-w-[23.75rem] ${placement}`}
    >
      <header className="flex flex-none items-center justify-between gap-3 border-b border-border/80 bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h3 id={titleId} className="truncate text-base font-semibold">
            {title}
          </h3>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label={`Fermer ${title}`}
          onClick={handleClose}
          className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Fermer
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3">
        {children}
      </div>
    </aside>
  );
}
