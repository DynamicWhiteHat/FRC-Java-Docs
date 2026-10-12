# RobotContainer

If subsystems are the parts of the robot, `RobotContainer` is the wiring. It's where the robot gets __assembled__: it creates the subsystems, creates the controllers, and decides which button makes which subsystem do what.

!!! info "A good way to think about it"
    __Subsystems know *how*.__ `IntakeSubsystem` knows how to spin its motor.
    __RobotContainer decides *when*.__ It says "when the driver holds A, run the intake."

That split means `RobotContainer` contains very little real logic. It reads almost like a list of instructions, and that's a good thing. If you find yourself writing math or `if` statements in here, it probably belongs in a subsystem.

## Anatomy of RobotContainer

Every `RobotContainer` has the same five parts. Here is the one WPILib generates for you, filled in for a robot with an intake and a drivetrain.

```java title="RobotContainer.java"
public class RobotContainer {
    private final DriveSubsystem m_drive = new DriveSubsystem();         // (1)!
    private final IntakeSubsystem m_intake = new IntakeSubsystem();

    private final CommandXboxController m_driverController =             // (2)!
        new CommandXboxController(OperatorConstants.kDriverControllerPort);

    public RobotContainer() {
        configureBindings();                                             // (3)!
    }

    private void configureBindings() {                                   // (4)!
        m_driverController.a().whileTrue(m_intake.intakeCommand());
    }

    public Command getAutonomousCommand() {                              // (5)!
        return Autos.driveForward(m_drive);
    }
}
```

1. The subsystems are created here, __once__. There is exactly one drivetrain and one intake on the robot, so there is exactly one of each object. Everything else gets handed these same objects.
2. The controller. The number is the USB port in the Driver Station, which is `0` for the first controller.
3. The constructor runs when the robot starts. It calls `configureBindings()` to hook everything up.
4. __Bindings__: "when this happens, run that command." This is where most of your edits will happen.
5. `Robot.java` calls this at the start of autonomous to find out what the robot should do on its own.

And here is where `Robot.java` creates it. This is one line you rarely touch:

```java title="Robot.java"
public Robot() {
    m_robotContainer = new RobotContainer();
}
```

!!! note "In the simulator"
    The editors below start your `RobotContainer` for you and tick the scheduler 50 times a second, just like `Robot.java` would. Where a `Robot` class is included, the simulator uses it instead.

## Reading the controller

A `CommandXboxController` gives you two kinds of things: __buttons__, which are on or off, and __axes__, which are numbers from -1.0 to 1.0.

| Buttons | Axes |
|---|---|
| `a()` `b()` `x()` `y()` | `getLeftX()` `getLeftY()` |
| `leftBumper()` `rightBumper()` | `getRightX()` `getRightY()` |
| `start()` `back()` | `getLeftTriggerAxis()` `getRightTriggerAxis()` |

Try the sticks. Run it, then drag the left stick on the virtual controller.

```playground
//@ title: Reading a stick
//@ panel: robot
//@ show: controller,dashboard
//@ goal: Run it, then push the left stick up and down. Notice which direction is positive. Then push the right stick sideways.
//@ lines: 16
public class RobotContainer {
    private final CommandXboxController m_driver = new CommandXboxController(0);
    private final Telemetry m_telemetry = new Telemetry(m_driver);
}

public class Telemetry extends SubsystemBase {
    private final CommandXboxController m_controller;

    public Telemetry(CommandXboxController controller) {
        m_controller = controller;
    }

    @Override
    public void periodic() {
        SmartDashboard.putNumber("Left Y", m_controller.getLeftY());
        SmartDashboard.putNumber("Right X", m_controller.getRightX());
    }
}
```

!!! warning "Up is negative"
    Pushing a joystick __forward__ gives a __negative__ Y value. That's a quirk of how the hardware reports it, and it trips up almost every new programmer. Drive code usually negates it: `-m_driver.getLeftY()`.

## Bindings: connecting buttons to commands

A button on the controller is a `Trigger`, and a trigger can start a command in different ways. The method you choose controls __when__ the command starts and stops.

| Method | The command runs... |
|---|---|
| `onTrue(command)` | Once, at the moment the button goes down. |
| `onFalse(command)` | Once, at the moment the button is released. |
| `whileTrue(command)` | While the button is held. It's cancelled on release. |
| `toggleOnTrue(command)` | On the first press, until you press again. |

It's easiest to feel the difference by trying them. This robot has three rollers, each one a separate subsystem built from the same class (that's Lesson 3's "many objects, one class" in action). Each button uses a different binding. __A__ starts roller 1, __B__ drives roller 2, __X__ drives roller 3, and __Y__ stops roller 1.

```playground
//@ title: Four ways to bind a button
//@ panel: robot
//@ goal: Run it. Tap A and let go: roller 1 keeps spinning (onTrue only runs once). Hold B: roller 2 spins only while held (whileTrue). Tap X twice: roller 3 toggles on and off. Tap Y to stop roller 1.
//@ lines: 38
public class Roller extends SubsystemBase {
    private final SparkMax m_motor;

    public Roller(int canId) {
        m_motor = new SparkMax(canId, MotorType.kBrushless);
    }

    public void set(double speed) {
        m_motor.set(speed);
    }
}

public class RobotContainer {
    private final Roller m_rollerA = new Roller(1);
    private final Roller m_rollerB = new Roller(2);
    private final Roller m_rollerX = new Roller(3);
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        configureBindings();
    }

    private void configureBindings() {
        m_driver.a().onTrue(
            m_rollerA.runOnce(() -> m_rollerA.set(0.5)));

        m_driver.y().onTrue(
            m_rollerA.runOnce(() -> m_rollerA.set(0.0)));

        m_driver.b().whileTrue(
            m_rollerB.startEnd(() -> m_rollerB.set(0.5), () -> m_rollerB.set(0.0)));

        m_driver.x().toggleOnTrue(
            m_rollerX.startEnd(() -> m_rollerX.set(0.5), () -> m_rollerX.set(0.0)));
    }
}
```

Now a prediction. This one binds three methods to the __same__ button. The test presses A, holds it for 3 loops, releases it, and runs 2 more loops. The message `Commands.runOnce` runs a single time, and `Commands.run` repeats every loop.

```playground
//@ title: onTrue, whileTrue and onFalse
//@ mode: predict
//@ prelude: wpilib
//@ goal: What gets printed, in order? Type one line per print.
//@ lines: 14
CommandXboxController controller = new CommandXboxController(0);

controller.a().onTrue(Commands.runOnce(() -> System.out.println("onTrue")));
controller.a().onFalse(Commands.runOnce(() -> System.out.println("onFalse")));
controller.a().whileTrue(Commands.run(() -> System.out.println("whileTrue")));

Sim.press(0, "A");
Sim.loops(3);
Sim.release(0, "A");
Sim.loops(2);
//@@ explain
The press fires `onTrue` once, and `whileTrue` prints on each of the 3 loops while A is down. On the loop where A is released, `onFalse` fires once and `whileTrue` is cancelled, so nothing more prints after that.
```

### Challenge: bind the intake

The intake has `intake()`, `outtake()` and `stop()` already. Finish `configureBindings()`:

- Hold the __right bumper__ to intake, and stop when it's released.
- Hold __B__ to outtake, and stop when it's released.

```playground
//@ title: Bind the intake
//@ prelude: wpilib
//@ goal: In configureBindings(), hold the right bumper to intake and hold B to outtake. Both should stop when the button is released.
//@ lines: 32
//@ require: rightBumper\(\)\s*\.\s*whileTrue | Bind rightBumper() with whileTrue.
//@ require: b\(\)\s*\.\s*whileTrue | Bind b() with whileTrue.
public class IntakeSubsystem extends SubsystemBase {
    private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);

    public void intake()  { m_motor.set(0.8); }
    public void outtake() { m_motor.set(-0.5); }
    public void stop()    { m_motor.set(0.0); }
}

public class RobotContainer {
    private final IntakeSubsystem m_intake = new IntakeSubsystem();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        configureBindings();
    }

    private void configureBindings() {
        // Add your two bindings here

    }
}
//@@ harness
RobotContainer container = new RobotContainer();
Sim.press(0, "RB");
Sim.loops(3);
System.out.println("holding right bumper: " + Sim.getMotorOutput(5));
Sim.release(0, "RB");
Sim.loops(2);
System.out.println("released: " + Sim.getMotorOutput(5));
Sim.press(0, "B");
Sim.loops(3);
System.out.println("holding B: " + Sim.getMotorOutput(5));
Sim.release(0, "B");
Sim.loops(2);
System.out.println("released: " + Sim.getMotorOutput(5));
//@@ expect
holding right bumper: 0.8
released: 0.0
holding B: -0.5
released: 0.0
//@@ hint
Use the same shape as the A button example: `m_driver.button().whileTrue(m_intake.startEnd(start, end));`
//@@ hint
`startEnd` needs two lambdas: one that starts the motor and one that stops it. `() -> m_intake.intake()` and `() -> m_intake.stop()`.
//@@ solution
public class IntakeSubsystem extends SubsystemBase {
    private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);

    public void intake()  { m_motor.set(0.8); }
    public void outtake() { m_motor.set(-0.5); }
    public void stop()    { m_motor.set(0.0); }
}

public class RobotContainer {
    private final IntakeSubsystem m_intake = new IntakeSubsystem();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        configureBindings();
    }

    private void configureBindings() {
        m_driver.rightBumper().whileTrue(
            m_intake.startEnd(() -> m_intake.intake(), () -> m_intake.stop()));

        m_driver.b().whileTrue(
            m_intake.startEnd(() -> m_intake.outtake(), () -> m_intake.stop()));
    }
}
//@@ explain
Both commands require the intake, so they never run at once. Whichever starts last wins, and releasing a button stops the intake.
```

!!! tip "Any true/false can be a trigger"
    A trigger isn't limited to controller buttons. You can build one from any `boolean`, like a sensor: `new Trigger(m_intake::hasPiece).onTrue(...)`. That reads as "when the intake gets a game piece, do this."

## Default commands: driving

Most subsystems sit idle until a button asks for them, but the drivetrain should respond to the sticks __all the time__. For that, a subsystem gets a __default command__: the command that runs whenever nothing else is using that subsystem. Press a button that needs the drivetrain, and the default command pauses. Let go, and it resumes.

Drive commands take their inputs as suppliers, the live lambdas from the [FRC Nuances](frcProgramming.md) page, so they read the sticks fresh every loop.

```playground
//@ title: A drivetrain with a default command
//@ panel: robot
//@ goal: Run it, switch to teleop, and drive with the sticks: left stick up for forward, right stick sideways to turn. Watch both motors. Then change -m_driver.getRightX() to m_driver.getRightX() and see what changes.
//@ lines: 32
public class DriveSubsystem extends SubsystemBase {
    private final SparkMax m_left = new SparkMax(1, MotorType.kBrushless);
    private final SparkMax m_right = new SparkMax(2, MotorType.kBrushless);
    private final DifferentialDrive m_drive = new DifferentialDrive(m_left, m_right);

    public Command arcadeDrive(DoubleSupplier forward, DoubleSupplier turn) {
        return run(() -> m_drive.arcadeDrive(forward.getAsDouble(), turn.getAsDouble()));
    }
}

public class RobotContainer {
    private final DriveSubsystem m_drive = new DriveSubsystem();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_drive.setDefaultCommand(
            m_drive.arcadeDrive(
                () -> -m_driver.getLeftY(),
                () -> -m_driver.getRightX()));
    }
}
```

!!! note "Why both sticks are negated"
    Forward on the left stick gives a negative Y, so `-getLeftY()` makes forward positive. For turning, WPILib treats a positive turn as __counterclockwise__, but pushing the stick to the right gives a positive X. So `-getRightX()` makes right mean turn right.

Now you wire one up. The drive subsystem is finished, so connect the sticks to it.

```playground
//@ title: Set the default command
//@ prelude: wpilib
//@ goal: In the RobotContainer constructor, make arcadeDrive the drivetrain's default command. Forward on the left stick drives forward, and sideways on the right stick turns.
//@ lines: 22
//@ require: setDefaultCommand | Use m_drive.setDefaultCommand(...).
//@ require: getLeftY | Drive forward and back using getLeftY().
public class DriveSubsystem extends SubsystemBase {
    private final SparkMax m_left = new SparkMax(1, MotorType.kBrushless);
    private final SparkMax m_right = new SparkMax(2, MotorType.kBrushless);
    private final DifferentialDrive m_drive = new DifferentialDrive(m_left, m_right);

    public Command arcadeDrive(DoubleSupplier forward, DoubleSupplier turn) {
        return run(() -> m_drive.arcadeDrive(forward.getAsDouble(), turn.getAsDouble()));
    }
}

public class RobotContainer {
    private final DriveSubsystem m_drive = new DriveSubsystem();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        // Set the default command here
    }
}
//@@ harness
RobotContainer container = new RobotContainer();
Sim.loops(1);
Sim.setAxis(0, "leftY", -1.0);
Sim.loops(2);
System.out.println("stick forward: " + Sim.getMotorOutput(1) + " " + Sim.getMotorOutput(2));
Sim.setAxis(0, "leftY", 1.0);
Sim.loops(2);
System.out.println("stick back: " + Sim.getMotorOutput(1) + " " + Sim.getMotorOutput(2));
Sim.setAxis(0, "leftY", 0.0);
Sim.loops(2);
System.out.println("stick centered: " + Sim.getMotorOutput(1) + " " + Sim.getMotorOutput(2));
//@@ expect
stick forward: 1.0 1.0
stick back: -1.0 -1.0
stick centered: 0.0 0.0
//@@ hint
`setDefaultCommand` is called on the subsystem and takes a command: `m_drive.setDefaultCommand(...)`.
//@@ hint
The command comes from `m_drive.arcadeDrive(forward, turn)`. Give it two lambdas that read the controller, and remember to negate the stick values.
//@@ solution
public class DriveSubsystem extends SubsystemBase {
    private final SparkMax m_left = new SparkMax(1, MotorType.kBrushless);
    private final SparkMax m_right = new SparkMax(2, MotorType.kBrushless);
    private final DifferentialDrive m_drive = new DifferentialDrive(m_left, m_right);

    public Command arcadeDrive(DoubleSupplier forward, DoubleSupplier turn) {
        return run(() -> m_drive.arcadeDrive(forward.getAsDouble(), turn.getAsDouble()));
    }
}

public class RobotContainer {
    private final DriveSubsystem m_drive = new DriveSubsystem();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_drive.setDefaultCommand(
            m_drive.arcadeDrive(
                () -> -m_driver.getLeftY(),
                () -> -m_driver.getRightX()));
    }
}
//@@ explain
That one statement is the entire driving code on many robots. Because the lambdas are suppliers, the sticks are read again on every 20 ms loop.
```

## Autonomous: getAutonomousCommand()

During the autonomous period, no one touches the controllers, so the robot has to run a pre-planned routine. In command-based code, an autonomous routine is just __one command__: usually several small commands chained together. `RobotContainer` builds it in `getAutonomousCommand()`, and `Robot.java` schedules it when autonomous starts.

Two helpers do most of the chaining:

- `command.withTimeout(seconds)` stops a command after that many seconds.
- `first.andThen(second)` runs `second` when `first` finishes.

Here is a complete example, `Robot.java` included, so you can see how it all hooks together. Run it, then switch to __auto__. The intake runs for a second and stops by itself. Switch to __teleop__ and the autonomous command is cancelled.

```playground
//@ title: A simple autonomous
//@ panel: robot
//@ goal: Run it and switch to auto: the intake runs for 1 second, then stops. Change the timeout, or chain a second step with andThen.
//@ lines: 42
public class IntakeSubsystem extends SubsystemBase {
    private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);

    public void intake() { m_motor.set(0.8); }
    public void stop()   { m_motor.set(0.0); }

    public Command intakeCommand() {
        return startEnd(() -> intake(), () -> stop());
    }
}

public class RobotContainer {
    private final IntakeSubsystem m_intake = new IntakeSubsystem();

    public Command getAutonomousCommand() {
        return m_intake.intakeCommand().withTimeout(1.0);
    }
}

public class Robot extends TimedRobot {
    private final RobotContainer m_robotContainer;
    private Command m_autonomousCommand;

    public Robot() {
        m_robotContainer = new RobotContainer();
    }

    @Override
    public void robotPeriodic() {
        CommandScheduler.getInstance().run();
    }

    @Override
    public void autonomousInit() {
        m_autonomousCommand = m_robotContainer.getAutonomousCommand();
        if (m_autonomousCommand != null) {
            m_autonomousCommand.schedule();
        }
    }

    @Override
    public void teleopInit() {
        if (m_autonomousCommand != null) {
            m_autonomousCommand.cancel();
        }
    }
}
```

```playground
//@ title: Build an autonomous routine
//@ prelude: wpilib
//@ goal: Make getAutonomousCommand() run the intake for 2 seconds, then outtake for 1 second.
//@ lines: 26
//@ require: withTimeout\s*\( | Use withTimeout(...) to limit how long each step runs.
//@ require: andThen\s*\( | Chain the two steps together with andThen(...).
public class IntakeSubsystem extends SubsystemBase {
    private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);

    public void intake()  { m_motor.set(0.8); }
    public void outtake() { m_motor.set(-0.5); }
    public void stop()    { m_motor.set(0.0); }

    public Command intakeCommand() {
        return startEnd(() -> intake(), () -> stop());
    }

    public Command outtakeCommand() {
        return startEnd(() -> outtake(), () -> stop());
    }
}

public class RobotContainer {
    private final IntakeSubsystem m_intake = new IntakeSubsystem();

    public Command getAutonomousCommand() {
        // Build the routine here
        return Commands.none();
    }
}
//@@ harness
RobotContainer container = new RobotContainer();
Command auto = container.getAutonomousCommand();
auto.schedule();
Sim.loops(10);
System.out.println("at 0.2 s: " + Sim.getMotorOutput(5));
Sim.loops(100);
System.out.println("at 2.4 s: " + Sim.getMotorOutput(5));
Sim.loops(60);
System.out.println("at 3.6 s: " + Sim.getMotorOutput(5));
//@@ expect
at 0.2 s: 0.8
at 2.4 s: -0.5
at 3.6 s: 0.0
//@@ hint
Start with the first step: `m_intake.intakeCommand().withTimeout(2.0)`.
//@@ hint
Then chain the second step on the end: `.andThen(m_intake.outtakeCommand().withTimeout(1.0))`.
//@@ solution
public class IntakeSubsystem extends SubsystemBase {
    private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);

    public void intake()  { m_motor.set(0.8); }
    public void outtake() { m_motor.set(-0.5); }
    public void stop()    { m_motor.set(0.0); }

    public Command intakeCommand() {
        return startEnd(() -> intake(), () -> stop());
    }

    public Command outtakeCommand() {
        return startEnd(() -> outtake(), () -> stop());
    }
}

public class RobotContainer {
    private final IntakeSubsystem m_intake = new IntakeSubsystem();

    public Command getAutonomousCommand() {
        return m_intake.intakeCommand().withTimeout(2.0)
            .andThen(m_intake.outtakeCommand().withTimeout(1.0));
    }
}
//@@ explain
Each step is a small command that cleans up after itself, so chaining them is just a sentence: "intake for two seconds, and then outtake for one."
```

## What belongs where?

Now that you've seen every part of the project, test your sense of where things go.

```quiz
@ title: RobotContainer
? Which of these belongs in `RobotContainer`?
- The code that sets the intake motor's speed
+ The line that makes the A button run the intake
- The intake motor's CAN id
- The code that calls `periodic()` on each subsystem
> Subsystems hold the "how", constants hold the numbers, and `RobotContainer` decides which button does what.

? You want a shooter to spin up when the driver presses Y, and keep spinning until Y is pressed again. Which binding fits?
- `onTrue`
- `whileTrue`
+ `toggleOnTrue`
- `onFalse`
> `toggleOnTrue` starts the command on the first press and cancels it on the next one.

? What does `whileTrue(command)` do when the button is released?
- Nothing, the command keeps going
+ Cancels the command
- Restarts the command
- Runs the command again
> That is what makes `startEnd` such a good match: the end action runs when the button is released.

? Why do drive commands take `() -> -controller.getLeftY()` instead of `-controller.getLeftY()`?
- Lambdas make the code run faster
+ The lambda reads the stick again on every loop, instead of once
- Java requires lambdas for negative numbers
- It saves memory on the roboRIO
> Without a lambda you'd capture the stick's value at one instant and the robot would never respond to it moving.

? Which statement about a default command is true?
- It runs once when the robot turns on
+ It runs whenever nothing else is using that subsystem
- It makes the subsystem ignore other commands
- Every subsystem must have one
> It's perfect for driving. Pressing a button that needs the drivetrain interrupts it, and it resumes afterwards.

? When does `Robot.java` ask `RobotContainer` for the autonomous command?
- When the robot is first powered on
+ When autonomous mode starts
- Every 20 ms
- When teleop starts
> `autonomousInit()` calls `getAutonomousCommand()` and schedules whatever comes back.

? Pushing the left stick forward reads...
- +1.0
+ -1.0
- 0.0
- It depends on the controller's batteries
> Forward is negative on Y, which is why drive code negates it.
```

---

## Where to go from here

You've now seen the whole shape of a command-based robot project: `Robot` runs the loop, `RobotContainer` wires everything together, and each subsystem owns a mechanism and exposes commands.

Some ideas to try on your own in the simulator editors above:

- Add a second subsystem, such as a shooter with two motors, and bind it to the left bumper.
- Make a trigger from a sensor so the intake stops itself when it has a game piece.
- Build a longer autonomous routine by chaining three or four commands with `andThen`.
- Move every number into a `Constants` class.

Keep your Java lessons handy too. Everything here, from classes and constructors to lambdas, is just the Java from those lessons doing robot work.
