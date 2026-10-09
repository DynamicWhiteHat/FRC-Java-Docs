(() => {
  "use strict";

  function initMotorLabs() {
    document.querySelectorAll("[data-motor-lab]").forEach((lab) => {
      if (lab.dataset.initialized === "true") return;
      lab.dataset.initialized = "true";

      const speedInput = lab.querySelector("[data-motor-speed]");
      const speedLabel = lab.querySelector("[data-speed-label]");
      const motorState = lab.querySelector("[data-motor-state]");
      const output = lab.querySelector("[data-motor-output]");
      const runButton = lab.querySelector("[data-motor-run]");
      const stopButton = lab.querySelector("[data-motor-stop]");
      const reverseButton = lab.querySelector("[data-motor-reverse]");
      let running = false;
      let direction = 1;

      const render = (message) => {
        const speed = Number(speedInput.value);
        speedLabel.textContent = String(speed);
        motorState.textContent = running ? "RUNNING" : "STOPPED";
        motorState.dataset.state = running ? "running" : "stopped";
        output.textContent = message || (running
          ? `setSpeed(${(speed / 100 * direction).toFixed(2)})`
          : "stop() → motor output = 0");
      };

      runButton?.addEventListener("click", () => {
        running = true;
        direction = 1;
        render("ShooterSubsystem.setSpeed(" + (Number(speedInput.value) / 100).toFixed(2) + ");");
      });
      stopButton?.addEventListener("click", () => {
        running = false;
        render("ShooterSubsystem.stop(); // motor output = 0");
      });
      reverseButton?.addEventListener("click", () => {
        running = true;
        direction = -1;
        render("ShooterSubsystem.setSpeed(" + (-Number(speedInput.value) / 100).toFixed(2) + ");");
      });
      speedInput?.addEventListener("input", () => render());
      render("Try a control to see which subsystem method would be called.");
    });
  }

  function initContainerLabs() {
    document.querySelectorAll("[data-container-lab]").forEach((lab) => {
      if (lab.dataset.initialized === "true") return;
      lab.dataset.initialized = "true";
      const output = lab.querySelector("[data-container-output]");
      const buttons = lab.querySelectorAll("[data-controller-action]");
      const commandState = new Map();

      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.dataset.controllerAction;
          const command = button.dataset.command || "ExampleCommand";
          const mode = button.dataset.mode || "onTrue";
          let lines = [];

          if (mode === "whileTrue") {
            const active = !commandState.get(action);
            commandState.set(action, active);
            lines = active
              ? [`Controller input: ${action} pressed`, `Schedule ${command}`, "Command.execute() begins running"]
              : [`Controller input: ${action} released`, `Cancel ${command}`, "Command.end(true) runs"];
            button.setAttribute("aria-pressed", String(active));
          } else if (mode === "toggle") {
            const active = !commandState.get(action);
            commandState.set(action, active);
            lines = [`Controller input: ${action} pressed`, active ? `Schedule ${command}` : `Cancel ${command}`];
            button.setAttribute("aria-pressed", String(active));
          } else {
            lines = [`Controller input: ${action} pressed`, `Schedule ${command}`, "The command calls a public method on its subsystem."];
          }

          output.textContent = lines.join("\n");
        });
      });
    });
  }

  function initKnowledgeChecks() {
    document.querySelectorAll("[data-knowledge-check]").forEach((check) => {
      if (check.dataset.initialized === "true") return;
      check.dataset.initialized = "true";
      const feedback = check.querySelector("[data-check-feedback]");
      check.querySelectorAll("[data-answer]").forEach((button) => {
        button.addEventListener("click", () => {
          const correct = button.dataset.answer === "correct";
          feedback.textContent = correct
            ? "Correct! Explain why this is the right choice before continuing."
            : "Not quite. Revisit the roles of the RobotContainer, command, and subsystem, then try again.";
          feedback.dataset.correct = String(correct);
        });
      });
    });
  }

  function init() {
    initMotorLabs();
    initContainerLabs();
    initKnowledgeChecks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
