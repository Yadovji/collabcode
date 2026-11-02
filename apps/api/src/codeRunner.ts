import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type RunnableLanguage = "python" | "java";
export type CodeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
};

const images: Record<RunnableLanguage, string> = {
  python: "python:3.12-alpine",
  java: "eclipse-temurin:21-jdk-alpine"
};
const RUN_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 16_000;

type DockerCommandResult = { exitCode: number | null; stdout: string; stderr: string; error?: Error };

function dockerCommand(args: string[], timeoutMs = 5_000): Promise<DockerCommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { if (stdout.length < 1000) stdout += chunk.slice(0, 1000 - stdout.length); });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { if (stderr.length < 1000) stderr += chunk.slice(0, 1000 - stderr.length); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: null, stdout, stderr, error }); });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : exitCode, stdout, stderr: timedOut ? `${stderr}\nDocker did not respond in time.` : stderr });
    });
  });
}

async function ensureDockerImage(language: RunnableLanguage): Promise<void> {
  const daemon = await dockerCommand(["info", "--format", "{{.ServerVersion}}"], 4_000);
  if (daemon.exitCode !== 0) {
    throw new Error("Docker Desktop is not available. Start Docker Desktop, then try again.");
  }
  const image = images[language];
  const result = await dockerCommand(["image", "inspect", "--format", "{{.Id}}", image]);
  if (result.exitCode !== 0) {
    throw new Error(`The ${language} runner image is not installed yet. In PowerShell, run: docker pull ${image}`);
  }
}

function stopContainer(containerName: string) {
  const child = spawn("docker", ["kill", containerName], { stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}

export async function runLocalCode(language: RunnableLanguage, source: string, mainClass?: string): Promise<CodeRunResult> {
  if (Buffer.byteLength(source, "utf8") > 32_000) throw new Error("Keep source files under 32 KB for this local runner.");
  if (language === "java" && (!mainClass || !/^[A-Za-z_$][\w$]*$/.test(mainClass))) {
    throw new Error("Use a Java file name such as Main.java and a public class with the same name. Java packages are not supported yet.");
  }
  if (language === "java" && /^\s*package\s+/m.test(source)) {
    throw new Error("Java packages are not supported yet. Remove the package declaration and run the class from its own .java file.");
  }
  await ensureDockerImage(language);

  const containerName = `collabcode-run-${randomUUID()}`;
  const baseArgs = [
    "run", "--rm", "--interactive", "--init", "--name", containerName,
    "--network", "none", "--cpus", "0.5", "--memory", "384m", "--memory-swap", "384m",
    "--pids-limit", "64", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--user", "10001:10001",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m,mode=1777",
    "--env", "HOME=/tmp", "--env", "TMPDIR=/tmp", "--stop-timeout", "1",
    images[language]
  ];
  const args = language === "python"
    ? [...baseArgs, "python", "-I", "-"]
    : [...baseArgs, "sh", "-c", 'cat > "/tmp/$1.java" && javac -J-Xmx128m -d /tmp "/tmp/$1.java" && java -Xms16m -Xmx96m -XX:ActiveProcessorCount=1 -cp /tmp "$1"', "collabcode-runner", mainClass!];

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let outputTruncated = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stopContainer(containerName);
      child.kill();
    }, RUN_TIMEOUT_MS);

    const stopForOutput = () => {
      outputTruncated = true;
      stopContainer(containerName);
      child.kill();
    };
    const collect = (target: "stdout" | "stderr", chunk: Buffer) => {
      const remaining = MAX_OUTPUT_BYTES - outputBytes;
      if (remaining <= 0) { stopForOutput(); return; }
      const accepted = chunk.subarray(0, remaining);
      outputBytes += accepted.length;
      const value = accepted.toString("utf8");
      if (target === "stdout") stdout += value;
      else stderr += value;
      if (accepted.length < chunk.length) stopForOutput();
    };

    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.stdin.on("error", () => undefined);
    child.stdin.end(source, "utf8");
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Could not start the Docker runner: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, durationMs: Date.now() - startedAt, timedOut, outputTruncated });
    });
  });
}
