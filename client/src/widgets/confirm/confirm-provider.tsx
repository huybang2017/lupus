import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import {
  ConfirmDialog,
  type ConfirmOptions,
  type ConfirmState,
} from "@/widgets/confirm/confirm-dialog";

type ConfirmOpener = (options: ConfirmOptions) => Promise<boolean>;

const openerRef: { current: ConfirmOpener | null } = { current: null };

let warned = false;

export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  if (!openerRef.current) {
    if (!warned) {
      warned = true;
      console.warn(
        "requestConfirm called with no ConfirmProvider mounted, resolving true",
      );
    }
    return Promise.resolve(true);
  }
  return openerRef.current(options);
}

export function ConfirmProvider(props: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    options: { description: "" },
  });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => {
    openerRef.current = (options) => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setState({ open: true, options });
      });
    };
    return () => {
      openerRef.current = null;
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);
  const settle = (value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
    if (resolve) resolve(value);
  };
  return (
    <>
      {props.children}
      <ConfirmDialog
        state={state}
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
      />
    </>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useCallback((options: ConfirmOptions) => requestConfirm(options), []);
}
