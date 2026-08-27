import { describe, it, expect } from "bun:test";
import { githubService } from "@/lib/services/github.service";

describe("GitHub Push Service & URL Parser", () => {
  it("should parse HTTPS GitHub URLs with or without .git", () => {
    const res1 = githubService.parseGitHubRepoUrl("https://github.com/facebook/react.git");
    expect(res1.owner).toBe("facebook");
    expect(res1.repo).toBe("react");

    const res2 = githubService.parseGitHubRepoUrl("https://github.com/shreybhuva123-cyber/hacksync");
    expect(res2.owner).toBe("shreybhuva123-cyber");
    expect(res2.repo).toBe("hacksync");
  });

  it("should parse owner/repo shorthand format", () => {
    const res = githubService.parseGitHubRepoUrl("vercel/next.js");
    expect(res.owner).toBe("vercel");
    expect(res.repo).toBe("next.js");
  });

  it("should parse SSH Git URLs", () => {
    const res = githubService.parseGitHubRepoUrl("git@github.com:torvalds/linux.git");
    expect(res.owner).toBe("torvalds");
    expect(res.repo).toBe("linux");
  });

  it("should reject invalid repository URLs", () => {
    expect(() => githubService.parseGitHubRepoUrl("")).toThrow();
    expect(() => githubService.parseGitHubRepoUrl("http://gitlab.com/invalid")).toThrow();
    expect(() => githubService.parseGitHubRepoUrl("invalid-format-no-slash")).toThrow();
  });
});
