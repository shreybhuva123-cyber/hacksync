import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Boxes,
  Database,
  FileCode2,
  GitBranch,
  LayoutDashboard,
  PlugZap,
  Search,
  Settings,
  ShieldAlert,
  TestTube2,
  Gauge,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { Workspace } from "@/lib/hacksync/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace | null | undefined;
  onOpenCopilot?: (() => void) | undefined;
}

export function CommandPalette({
  open,
  onOpenChange,
  workspace,
  onOpenCopilot,
}: CommandPaletteProps) {
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command, route, or search files..." />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Primary Engineering Workspaces */}
        <CommandGroup heading="Engineering Workspaces">
          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/dashboard" }))}
          >
            <LayoutDashboard className="mr-2.5 size-4 text-primary" />
            <span>Project Overview</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/code" }))}
          >
            <FileCode2 className="mr-2.5 size-4 text-primary" />
            <span>Code Intelligence Workspace</span>
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/security" }))}
          >
            <ShieldAlert className="mr-2.5 size-4 text-destructive" />
            <span>Cyber Security Center</span>
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/testing" as any }))}
          >
            <TestTube2 className="mr-2.5 size-4 text-success" />
            <span>Testing Center & Fix-Verify</span>
            <CommandShortcut>G T</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/evaluation" as any }))}
          >
            <Gauge className="mr-2.5 size-4 text-warning" />
            <span>Evaluation & Model Benchmarks</span>
            <CommandShortcut>G E</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/git" }))}
          >
            <GitBranch className="mr-2.5 size-4 text-info" />
            <span>Git Intelligence & Blast Radius</span>
            <CommandShortcut>G G</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/settings" }))}
          >
            <Settings className="mr-2.5 size-4 text-muted-foreground" />
            <span>Project & Tenant Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Engineering Actions */}
        <CommandGroup heading="Engineering Actions">
          <CommandItem
            onSelect={() =>
              handleSelect(() => {
                if (onOpenCopilot) onOpenCopilot();
              })
            }
          >
            <Bot className="mr-2.5 size-4 text-primary" />
            <span>Launch Evidence-First AI Copilot</span>
            <CommandShortcut>Ctrl+J</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/security" }))}
          >
            <ShieldAlert className="mr-2.5 size-4 text-destructive" />
            <span>Run SAST Vulnerability & Secret Audit</span>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/testing" as any }))}
          >
            <TestTube2 className="mr-2.5 size-4 text-success" />
            <span>Plan Targeted Test Suite for Changes</span>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/evaluation" as any }))}
          >
            <Gauge className="mr-2.5 size-4 text-warning" />
            <span>Execute Model Evaluation Benchmark</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Secondary Specifications */}
        <CommandGroup heading="Contracts & Architecture">
          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/api" }))}
          >
            <PlugZap className="mr-2.5 size-4 text-muted-foreground" />
            <span>API Contracts & Endpoints</span>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/schema" }))}
          >
            <Database className="mr-2.5 size-4 text-muted-foreground" />
            <span>PostgreSQL Schema & Tables</span>
          </CommandItem>

          <CommandItem
            onSelect={() => handleSelect(() => void navigate({ to: "/architecture" }))}
          >
            <Boxes className="mr-2.5 size-4 text-muted-foreground" />
            <span>Component Architecture Graph</span>
          </CommandItem>
        </CommandGroup>

        {/* Files in Workspace if available */}
        {workspace?.codeNodes && workspace.codeNodes.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Workspace Files">
              {workspace.codeNodes.slice(0, 8).map((file) => (
                <CommandItem
                  key={file.id}
                  onSelect={() =>
                    handleSelect(() => void navigate({ to: "/code" }))
                  }
                >
                  <FileCode2 className="mr-2.5 size-4 text-muted-foreground" />
                  <span className="mono text-xs truncate">{file.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
