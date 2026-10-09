# Subsystems: Representing a Mechanism

A **subsystem** is a class that represents a part of the robot, usually a mechanism such as a drivetrain, elevator, intake, or shooter. It groups the hardware and the methods that other parts of the program use to operate it.

For command-based projects, a subsystem commonly extends WPILib's `SubsystemBase`:

```java
package frc.robot.subsystems;

import edu.wpi.first.wpilibj2.command.SubsystemBase;

public class ShooterSubsystem extends SubsystemBase {
    public ShooterSubsystem() {
        // Configure the shooter's motor controller here.
    }

    public void setSpeed(double speed) {
        // Send the requested output to the motor controller.
    }

    public void stop() {
        setSpeed(0.0);
    }
}
```

This is a teaching skeleton, not deployable motor-control code: it intentionally leaves out the vendor-specific motor-controller setup. The key idea is the class's public interface: commands can request `setSpeed(...)` or `stop()` without needing to know the motor controller's details.

## Why not put all the motor code in RobotContainer?

Imagine that the shooter motor changes from one vendor's controller to another. If all motor setup and control code is scattered through commands and RobotContainer, the change becomes difficult. If the subsystem owns the hardware, most of the hardware-specific edits stay in one place.

- **Subsystem:** owns mechanism hardware and offers meaningful operations.
- **Command:** decides when and for how long an operation should happen.
- **RobotContainer:** creates the objects and connects inputs to commands.

## Interactive lab: command the shooter

Adjust the requested speed and try running, reversing, and stopping the shooter. This is a browser-side teaching model: it displays the subsystem method call that would be requested. It does not simulate physics, compile Java, or control real hardware.

<div class="frc-lab" data-motor-lab>
  <h3>ShooterSubsystem control panel</h3>
  <label for="shooter-speed">Requested motor output: <strong><span data-speed-label>50</span>%</strong></label>
  <div class="frc-lab__controls">
    <input id="shooter-speed" type="range" min="0" max="100" step="5" value="50" data-motor-speed />
  </div>
  <div class="frc-lab__readout">
    <span>Mechanism state:</span>
    <span class="frc-lab__state" data-motor-state data-state="stopped">STOPPED</span>
  </div>
  <div class="frc-lab__controls">
    <button type="button" data-motor-run>Run forward</button>
    <button type="button" data-motor-reverse>Run reverse</button>
    <button type="button" data-motor-stop>Stop</button>
  </div>
  <p><strong>Method call / output trace</strong></p>
  <pre class="frc-lab__output" data-motor-output aria-live="polite">Try a control to see the subsystem method call.</pre>
</div>

### Think about what you observed

- Why is it useful for a command to call `shooter.setSpeed(0.5)` instead of talking directly to the motor controller?
- Why should `stop()` be a method on the subsystem?
- What should happen if two commands both try to control the same shooter subsystem?

That last question introduces a major Command-Based concept: **subsystem requirements**. Commands declare which subsystems they use so the scheduler can manage conflicts rather than letting two commands independently fight over one mechanism.

## The `periodic()` method

WPILib calls a subsystem's `periodic()` method regularly while the scheduler runs. It is useful for recurring tasks such as updating telemetry or checking sensor values. It is not a place to put a long blocking loop that waits for a mechanism to finish.

```java
@Override
public void periodic() {
    // Example: publish sensor readings or update telemetry.
}
```

Use commands for actions that have a start, ongoing behavior, and an end. Use subsystem methods for the mechanism operations those commands need.

## Practice: identify the responsibility

<div class="frc-lab" data-knowledge-check>
  <h3>A student wants to add a method that sets the elevator motor output. Where should it go?</h3>
  <div class="frc-lab__controls">
    <button type="button" data-answer="wrong">Only in Robot.java</button>
    <button type="button" data-answer="correct">ElevatorSubsystem</button>
    <button type="button" data-answer="wrong">In the controller's button definition</button>
  </div>
  <p data-check-feedback aria-live="polite">Choose an answer to see feedback.</p>
</div>

<div class="frc-lab" data-knowledge-check>
  <h3>A shooter should run while a button is held. Which piece should define the action's lifecycle?</h3>
  <div class="frc-lab__controls">
    <button type="button" data-answer="wrong">The motor controller object alone</button>
    <button type="button" data-answer="correct">A command with the shooter subsystem as a requirement</button>
    <button type="button" data-answer="wrong">The MkDocs navigation file</button>
  </div>
  <p data-check-feedback aria-live="polite">Choose an answer to see feedback.</p>
</div>

## Next lesson

The next step is to write a command that uses a subsystem. You'll learn the command lifecycle—`initialize()`, `execute()`, `isFinished()`, and `end()`—then wire that command to a controller button in `RobotContainer`.
