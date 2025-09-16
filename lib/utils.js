import { spawn } from "node:child_process";

/**
 * Spawn a process and return a promise
 * @param {string} binary The binary to spawn
 * @param {string[]} args The arguments to pass to the binary
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export function spawnPromise(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}
