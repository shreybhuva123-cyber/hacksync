import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";
import { ErrorState, LoadingState } from "./primitives";
import { NoWorkspaceOnboarding } from "./NoWorkspaceOnboarding";

export function WorkspaceView({
  children,
  allowEmpty,
}: {
  children: (ws: Workspace) => ReactNode;
  allowEmpty?: boolean;
}) {
  const { data, isLoading, error, refetch } = useWorkspace();

  if (isLoading) return <LoadingState />;
  if (error)
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "Could not reach the workspace. Check your connection and retry."
        }
        onRetry={() => void refetch()}
      />
    );
  if (!data) {
    if (allowEmpty) return <>{children(null as unknown as Workspace)}</>;
    return <NoWorkspaceOnboarding />;
  }
  return <>{children(data)}</>;
}
