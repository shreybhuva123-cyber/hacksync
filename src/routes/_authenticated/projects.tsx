import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import { PageHeader } from "@/components/hacksync/primitives";
import { useAuth } from "@/hooks/useAuth";
import { useActiveProjectId, setActiveProjectId } from "@/hooks/useActiveProject";
import { useUserProjects, useCreateProject, useJoinProject } from "@/lib/hacksync/workspace";
import {
  createProjectSubfolder,
  scaffoldInitialProjectFiles,
  saveStoredDirectoryState,
  setActiveDirectoryHandle,
} from "@/lib/hacksync/local-filesystem";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { JoinProjectModal } from "@/components/projects/JoinProjectModal";
import { ProjectListGrid } from "@/components/projects/ProjectListGrid";
import type { Role } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — HackSync" },
      {
        name: "description",
        content: "Create, join, and switch between HackSync workspaces.",
      },
      { property: "og:title", content: "Projects — HackSync" },
      {
        property: "og:description",
        content: "Manage your hackathon team workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  return <WorkspaceView allowEmpty>{() => <ProjectsBody />}</WorkspaceView>;
}

function ProjectsBody() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeId] = useActiveProjectId();
  const { data: userProjects = [], isLoading } = useUserProjects();
  const createProject = useCreateProject();
  const joinProject = useJoinProject();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const handleCreate = async (input: {
    name: string;
    description?: string | undefined;
    repo_url?: string | undefined;
    role: Role;
    directoryHandle?: FileSystemDirectoryHandle | null | undefined;
    autoScaffold?: boolean | undefined;
  }) => {
    const project = await createProject.mutateAsync({
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.repo_url ? { repo_url: input.repo_url } : {}),
      role: input.role,
      displayName: user?.email ? (user.email.split("@")[0] || "You") : "You",
      userId: user?.id ?? "local-user",
    });

    if (input.directoryHandle) {
      try {
        const subfolder = await createProjectSubfolder(input.directoryHandle, input.name);
        if (input.autoScaffold) {
          await scaffoldInitialProjectFiles(subfolder, input.name, input.role);
        }
        setActiveDirectoryHandle(subfolder);
        saveStoredDirectoryState({ connected: true, name: input.name });
      } catch (err) {
        console.warn("Could not create local subfolder:", err);
      }
    }

    setActiveProjectId(project.id);
    navigate({ to: "/dashboard" });
  };

  const handleJoin = async (input: { inviteCode: string; role: Role }) => {
    const project = await joinProject.mutateAsync({
      inviteCode: input.inviteCode,
      displayName: user?.email ? (user.email.split("@")[0] || "You") : "You",
      role: input.role,
      userId: user?.id ?? "local-user",
    });

    setActiveProjectId(project.id);
    navigate({ to: "/dashboard" });
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="multi-workspace control"
        title="Your HackSync Projects"
        description="Select an active workspace, join an existing hackathon team with an invite code, or start a new project."
      />

      <ProjectListGrid
        projects={userProjects}
        activeId={activeId}
        isLoading={isLoading}
        onSelectProject={handleSelectProject}
        onCreateClick={() => setShowCreate(true)}
        onJoinClick={() => setShowJoin(true)}
      />

      <CreateProjectModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        isLoading={createProject.isPending}
      />

      <JoinProjectModal
        isOpen={showJoin}
        onClose={() => setShowJoin(false)}
        onSubmit={handleJoin}
        isLoading={joinProject.isPending}
      />
    </div>
  );
}
