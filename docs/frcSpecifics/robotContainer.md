# RobotContainer

If subsystems are the parts of the robot, `RobotContainer` is where the parts get assembled. It builds every subsystem, picks whether they talk to real or simulated hardware, creates the controllers, and connects each button to something that happens.

!!! info "A good way to think about it"
    __Subsystems know *how*.__ `Intake` knows how to run its rollers.
    __RobotContainer builds *what exists*.__ It creates the intake and hands it the right IO class.
    __The buttons decide *when*.__ Pressing A tells the robot to start intaking.

`RobotContainer` should contain very little real logic. It reads almost like a list of instructions, and that's a good thing. If you find yourself writing math in here, it probably belongs in a subsystem.

## Four steps, in order

Our `RobotContainer` has a constructor that does the same four things every year, each in its own method.

```java title="RobotContainer.java"
public RobotContainer() {
    configureSubsystems();     // build the subsystems, real or sim
    configureCommands();       // the autonomous chooser and its routines
    configureControllers();    // which controller is plugged in
    configureButtonBindings(); // what each button does
}
```

The order matters. Bindings need the controllers, and the controllers' buttons need the subsystems to point at. We'll go through them in a slightly different order, starting with the most surprising one.

## Real, sim or replay?

Remember the three IO classes from [Subsystems](subsystems.md)? `RobotContainer` is where one of them is chosen. It looks at a setting called the __mode__ and builds each subsystem with the matching IO class.

```java title="Constants.java"
public static enum Mode {
    REAL,    // running on the robot
    PROTO,   // running on the practice board, with some mechanisms real and some simulated
    SIM,     // running on a laptop, with pretend hardware
    REPLAY   // replaying a log file, with no hardware
}
```

The mode is set once. When the code is on a roboRIO, WPILib can tell, so `kCurrentMode` is `REAL` there and `SIM` everywhere else. To replay a log, we change it by hand. Then `configureSubsystems()` is one big `switch`:

```java title="configureSubsystems(), shortened"
switch (Constants.kCurrentMode) {
    case REAL:
        m_intake = new Intake(new IntakeRollerIOKraken(Ports.kIntakeRoller), ...);
        break;
    case SIM:
        m_intake = new Intake(new IntakeRollerIOSim(), ...);
        break;
    case REPLAY:
        m_intake = new Intake(new IntakeRollerIOReplay(), ...);
        break;
}
```

That `switch` is the __only__ place that decides which IO class each subsystem is connected to. (A few other spots check the mode too, such as `Robot.java` choosing where to send the logs, but none of them choose the hardware.) Try it. Here's the full intake with a mode switch. Run it, switch to __Teleop__, press __A__, and look at the dashboard. Then change `kCurrentMode` to `Mode.REAL`, press __Restart__, and press __A__ again. A motor shows up, because now `IntakeIOKraken` is the class being used. Then try `Mode.REPLAY`: nothing responds at all, because that class does nothing.

```playground
//@ title: Real, sim or replay?
//@ panel: robot
//@ show: controller,motors,dashboard
//@ goal: Run it, go to Teleop, and press A. Then change kCurrentMode to Mode.REAL and restart: a motor appears. Try Mode.REPLAY: nothing happens.
//@ lines: 130
//@ maxlines: 34
public interface IntakeIO {
    @AutoLog
    public static class IntakeInputs {
        public double velocityRPS;
        public double voltage;
    }

    public void updateInputs(IntakeInputs inputs);

    public void setVoltage(double voltage);
}

public class IntakeIOSim implements IntakeIO {
    private double m_voltage = 0.0;
    private double m_velocity = 0.0;

    @Override
    public void updateInputs(IntakeInputs inputs) {
        m_velocity += (m_voltage * 8.0 - m_velocity) * 0.2;
        inputs.velocityRPS = m_velocity;
        inputs.voltage = m_voltage;
    }

    @Override
    public void setVoltage(double voltage) {
        m_voltage = voltage;
    }
}

public class IntakeIOKraken implements IntakeIO {
    private final TalonFX m_motor;
    private final VoltageOut m_voltageOut = new VoltageOut(0.0).withEnableFOC(true);
    private double m_voltage = 0.0;

    public IntakeIOKraken(int port) {
        m_motor = new TalonFX(port);
    }

    @Override
    public void updateInputs(IntakeInputs inputs) {
        // a real class reads the motor's sensors here
        inputs.voltage = m_voltage;
    }

    @Override
    public void setVoltage(double voltage) {
        m_voltage = voltage;
        m_motor.setControl(m_voltageOut.withOutput(voltage));
    }
}

public class IntakeIOReplay implements IntakeIO {
    @Override
    public void updateInputs(IntakeInputs inputs) {}

    @Override
    public void setVoltage(double voltage) {}
}

public class Intake extends SubsystemBase {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private final IntakeIO m_io;
    private final IntakeInputsAutoLogged m_inputs = new IntakeInputsAutoLogged();
    private final SubsystemProfiles<IntakeState> m_profiles;

    public Intake(IntakeIO io) {
        m_io = io;

        Map<IntakeState, Runnable> periodicHash = new HashMap<>();
        periodicHash.put(IntakeState.kStow, this::stowPeriodic);
        periodicHash.put(IntakeState.kIntaking, this::intakingPeriodic);
        periodicHash.put(IntakeState.kOuttaking, this::outtakingPeriodic);

        m_profiles = new SubsystemProfiles<>(periodicHash, IntakeState.kStow);
    }

    public void updateState(IntakeState state) {
        m_profiles.setCurrentProfile(state);
    }

    public IntakeState getCurrentState() {
        return m_profiles.getCurrentProfile();
    }

    @Override
    public void periodic() {
        m_io.updateInputs(m_inputs);
        m_profiles.getPeriodicFunctionTimed().run();
        Logger.processInputs("Intake", m_inputs);
        Logger.recordOutput("Intake/State", m_profiles.getCurrentProfile());
    }

    public void stowPeriodic() {
        m_io.setVoltage(0.0);
    }

    public void intakingPeriodic() {
        m_io.setVoltage(8.0);
    }

    public void outtakingPeriodic() {
        m_io.setVoltage(-8.0);
    }
}

public class Constants {
    public enum Mode {
        REAL,
        SIM,
        REPLAY
    }

    public static final Mode kCurrentMode = Mode.SIM;

    public static final class Ports {
        public static final int kIntakeRoller = 5;
    }
}

public class RobotContainer {
    private Intake m_intake;
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        configureSubsystems();
        configureButtonBindings();
    }

    private void configureSubsystems() {
        switch (Constants.kCurrentMode) {
            case REAL:
                m_intake = new Intake(new IntakeIOKraken(Constants.Ports.kIntakeRoller));
                break;
            case SIM:
                m_intake = new Intake(new IntakeIOSim());
                break;
            case REPLAY:
                m_intake = new Intake(new IntakeIOReplay());
                break;
        }
    }

    private void configureButtonBindings() {
        m_driver.a().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));
        m_driver.x().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));
    }
}
```

On the robot, the Kraken class also reads the motor's actual speed and current. The pretend one here only echoes the voltage, so some dashboard numbers stay at zero in `REAL` mode.

Now fill in the missing case yourself. This method builds the intake for any mode, but someone forgot about replays.

```playground
//@ title: Add the replay case
//@ goal: Add the REPLAY case so a replay builds the intake with IntakeIOReplay. Don't forget the break.
//@ lines: 38
//@ require: case\s+REPLAY | Add a case for REPLAY.
//@ require: new\s+IntakeIOReplay | Build the intake with IntakeIOReplay.
public enum Mode {
    REAL,
    SIM,
    REPLAY
}

public interface IntakeIO {
    void setVoltage(double voltage);
}

public class IntakeIOKraken implements IntakeIO {
    public IntakeIOKraken(int port) {}

    @Override
    public void setVoltage(double voltage) {}
}

public class IntakeIOSim implements IntakeIO {
    @Override
    public void setVoltage(double voltage) {}
}

public class IntakeIOReplay implements IntakeIO {
    @Override
    public void setVoltage(double voltage) {}
}

public class Intake {
    private final IntakeIO m_io;

    public Intake(IntakeIO io) {
        m_io = io;
    }

    public String getIOName() {
        return m_io.getClass().getSimpleName();
    }
}

public class RobotContainer {
    public static Intake buildIntake(Mode mode) {
        Intake intake = null;

        switch (mode) {
            case REAL:
                intake = new Intake(new IntakeIOKraken(5));
                break;
            case SIM:
                intake = new Intake(new IntakeIOSim());
                break;
            // Add the REPLAY case here:

        }

        return intake;
    }
}
//@@ harness
System.out.println(RobotContainer.buildIntake(Mode.REAL).getIOName());
System.out.println(RobotContainer.buildIntake(Mode.SIM).getIOName());
System.out.println(RobotContainer.buildIntake(Mode.REPLAY).getIOName());
//@@ expect
IntakeIOKraken
IntakeIOSim
IntakeIOReplay
//@@ hint
Copy the SIM case and change what it builds.
//@@ hint
`case REPLAY:` then `intake = new Intake(new IntakeIOReplay());` then `break;`
//@@ solution
public enum Mode {
    REAL,
    SIM,
    REPLAY
}

public interface IntakeIO {
    void setVoltage(double voltage);
}

public class IntakeIOKraken implements IntakeIO {
    public IntakeIOKraken(int port) {}

    @Override
    public void setVoltage(double voltage) {}
}

public class IntakeIOSim implements IntakeIO {
    @Override
    public void setVoltage(double voltage) {}
}

public class IntakeIOReplay implements IntakeIO {
    @Override
    public void setVoltage(double voltage) {}
}

public class Intake {
    private final IntakeIO m_io;

    public Intake(IntakeIO io) {
        m_io = io;
    }

    public String getIOName() {
        return m_io.getClass().getSimpleName();
    }
}

public class RobotContainer {
    public static Intake buildIntake(Mode mode) {
        Intake intake = null;

        switch (mode) {
            case REAL:
                intake = new Intake(new IntakeIOKraken(5));
                break;
            case SIM:
                intake = new Intake(new IntakeIOSim());
                break;
            case REPLAY:
                intake = new Intake(new IntakeIOReplay());
                break;
        }

        return intake;
    }
}
//@@ explain
Without that case, a replay would leave `intake` as `null` and the robot code would crash the moment it touched it. Every mode needs a case, and every subsystem needs a line in each one.
```

```quiz
@ title: Choosing the hardware
? Which part of the program decides whether the intake uses real or simulated hardware?
- The `Intake` class
- `IntakeIO`
+ The `switch` in `configureSubsystems()`
- The driver, with a button
> It's the one place that knows. Everything else just uses the `IntakeIO` it was given.

? You replay a match log on your laptop. Which mode do you want?
- `REAL`
- `SIM`
+ `REPLAY`
- `PROTO`
> `REPLAY` builds every subsystem with its empty replay IO class, so the logged readings drive the code.

? Why does each subsystem get its IO class passed into its constructor, instead of creating it inside?
- Constructors can't create objects
+ So `RobotContainer` can choose which IO class it gets, without the subsystem changing
- It makes the code run faster
- It's required by WPILib
> Passing a dependency in, rather than building it inside, is what makes the classes swappable.
```

## Controllers: ask for what, not which button

Our code never says "the left bumper." It says `coralIntake()`. A small interface lists everything a driver can do, and a class for each kind of controller says which button does it.

```java title="DriverControls.java"
public interface DriverControls {
    public double getForward();

    public Trigger coralIntake();

    public Trigger coralOuttake();

    public Trigger climb();
}
```

```java title="DriverControlsXbox.java"
public class DriverControlsXbox implements DriverControls {
    private CommandXboxController m_controller;

    public DriverControlsXbox(int port) {
        m_controller = new CommandXboxController(port);
    }

    @Override
    public double getForward() {
        return -m_controller.getLeftY();
    }

    @Override
    public Trigger coralIntake() {
        return m_controller.leftBumper();
    }

    @Override
    public Trigger climb() {
        return m_controller.a();
    }
    // ...
}
```

It's the interface idea again. We have a second class, `DriverControlsPS5`, for a PlayStation controller. To switch, `configureControllers()` changes one line:

```java title="configureControllers()"
// m_driverControls = new DriverControlsXbox(0);
m_driverControls = new DriverControlsPS5(0);
```

And if the team decides to move the climb to a different button, you change it in one class, and not in every file that uses it.

Two details worth noticing. `getForward()` returns `-m_controller.getLeftY()`, with a minus sign. On a controller, pushing a stick forward reads __negative__, which is the opposite of what you want, so the controller class flips it once, here, and nobody else has to think about it. And each button method returns a `Trigger`, which is how you hook up what happens when it's pressed (below).

Time to write one. This controller class has the intake button but not the outtake button. The outtake should be the __B__ button.

```playground
//@ title: Write the outtake button
//@ prelude: wpilib
//@ goal: Add an outtake() method to DriverControlsXbox that returns the B button.
//@ lines: 56
//@ maxlines: 30
//@ require: Trigger\s+outtake\s*\( | Write a method named outtake that returns a Trigger.
public interface DriverControls {
    double getForward();

    Trigger intake();

    Trigger outtake();
}

public class DriverControlsXbox implements DriverControls {
    private final CommandXboxController m_controller;

    public DriverControlsXbox(int port) {
        m_controller = new CommandXboxController(port);
    }

    @Override
    public double getForward() {
        return -m_controller.getLeftY();
    }

    @Override
    public Trigger intake() {
        return m_controller.a();
    }

    // Write outtake() here. It should be the B button.

}

public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();
    private final DriverControls m_driverControls = new DriverControlsXbox(0);

    public RobotContainer() {
        m_driverControls.intake().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));
        m_driverControls.outtake().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kOuttaking)));
    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ harness
RobotContainer container = new RobotContainer();
Sim.press(0, "B");
Sim.loops(2);
System.out.println(container.getIntake().getCurrentState());
//@@ expect
kOuttaking
//@@ hint
It looks just like `intake()`, but for a different button.
//@@ hint
`@Override public Trigger outtake() { return m_controller.b(); }`
//@@ solution
public interface DriverControls {
    double getForward();

    Trigger intake();

    Trigger outtake();
}

public class DriverControlsXbox implements DriverControls {
    private final CommandXboxController m_controller;

    public DriverControlsXbox(int port) {
        m_controller = new CommandXboxController(port);
    }

    @Override
    public double getForward() {
        return -m_controller.getLeftY();
    }

    @Override
    public Trigger intake() {
        return m_controller.a();
    }

    @Override
    public Trigger outtake() {
        return m_controller.b();
    }
}

public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();
    private final DriverControls m_driverControls = new DriverControlsXbox(0);

    public RobotContainer() {
        m_driverControls.intake().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));
        m_driverControls.outtake().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kOuttaking)));
    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ explain
`RobotContainer` already says `m_driverControls.outtake()`. Now the Xbox class says which physical button that is. A PlayStation class would answer differently and nothing else would change.
```

## Bindings: buttons change states

A `Trigger` is a button (or any true/false condition) that can start things when it changes. Here are the ways to react to it:

| Method | When it happens |
|---|---|
| `onTrue(command)` | Once, at the moment the button goes down. |
| `onFalse(command)` | Once, at the moment the button is released. |
| `whileTrue(command)` | While the button is held. It's cancelled on release. |

Since our subsystems have states instead of commands, a binding wraps a state change in `Commands.runOnce`. `runOnce` takes a lambda, a package of code, and makes a command that runs it one time and finishes.

```java
m_driverControls.coralIntake().onTrue(
    Commands.runOnce(() -> m_intake.updateState(IntakeState.kIntaking)));
```

Read it as: "when the intake button goes down, run this one line, which sets the intake's state." Nothing happens right then except the state change. The next `periodic()` does the rest.

Triggers can be chained, so one button can do something on press and something else on release. Here's a tap, a hold, and a plain button. Run it, switch to __Teleop__, tap __A__ (the intake keeps going after you let go), hold __B__ (it outtakes only while held), and tap __X__ to stow.

```playground
//@ title: Tap, hold and stow
//@ panel: robot
//@ show: controller,dashboard
//@ goal: Run it, go to Teleop. Tap A: the intake keeps running. Hold B: it outtakes only while held. Press X to stow. Watch Intake/State change on the dashboard.
//@ lines: 100
//@ maxlines: 34
public interface IntakeIO {
    @AutoLog
    public static class IntakeInputs {
        public double velocityRPS;
        public double voltage;
    }

    public void updateInputs(IntakeInputs inputs);

    public void setVoltage(double voltage);
}

public class IntakeIOSim implements IntakeIO {
    private double m_voltage = 0.0;
    private double m_velocity = 0.0;

    @Override
    public void updateInputs(IntakeInputs inputs) {
        m_velocity += (m_voltage * 8.0 - m_velocity) * 0.2;
        inputs.velocityRPS = m_velocity;
        inputs.voltage = m_voltage;
    }

    @Override
    public void setVoltage(double voltage) {
        m_voltage = voltage;
    }
}

public class Intake extends SubsystemBase {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private final IntakeIO m_io;
    private final IntakeInputsAutoLogged m_inputs = new IntakeInputsAutoLogged();
    private final SubsystemProfiles<IntakeState> m_profiles;

    public Intake(IntakeIO io) {
        m_io = io;

        Map<IntakeState, Runnable> periodicHash = new HashMap<>();
        periodicHash.put(IntakeState.kStow, this::stowPeriodic);
        periodicHash.put(IntakeState.kIntaking, this::intakingPeriodic);
        periodicHash.put(IntakeState.kOuttaking, this::outtakingPeriodic);

        m_profiles = new SubsystemProfiles<>(periodicHash, IntakeState.kStow);
    }

    public void updateState(IntakeState state) {
        m_profiles.setCurrentProfile(state);
    }

    public IntakeState getCurrentState() {
        return m_profiles.getCurrentProfile();
    }

    @Override
    public void periodic() {
        m_io.updateInputs(m_inputs);
        m_profiles.getPeriodicFunctionTimed().run();
        Logger.processInputs("Intake", m_inputs);
        Logger.recordOutput("Intake/State", m_profiles.getCurrentProfile());
    }

    public void stowPeriodic() {
        m_io.setVoltage(0.0);
    }

    public void intakingPeriodic() {
        m_io.setVoltage(8.0);
    }

    public void outtakingPeriodic() {
        m_io.setVoltage(-8.0);
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake(new IntakeIOSim());
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        // A: tap to start. It stays in this state until something changes it.
        m_driver.a().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));

        // B: outtake while held, stow on release
        m_driver.b()
            .onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kOuttaking)))
            .onFalse(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));

        // X: stow
        m_driver.x().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));
    }
}
```

Your turn. A is already bound. Bind __B__ so the intake outtakes while B is held and goes back to stow when it's released.

```playground
//@ title: Hold to outtake
//@ prelude: wpilib
//@ goal: Bind the B button: set the state to kOuttaking when it goes down, and kStow when it's released. Use onTrue and onFalse.
//@ lines: 36
//@ maxlines: 30
//@ require: \.b\(\) | Use the B button: m_driver.b().
//@ require: onTrue | Use onTrue for the press.
//@ require: onFalse | Use onFalse for the release.
public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_driver.a().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));

        // Bind B here:

    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ harness
RobotContainer container = new RobotContainer();
Sim.press(0, "B");
Sim.loops(2);
System.out.println(container.getIntake().getCurrentState());
Sim.release(0, "B");
Sim.loops(2);
System.out.println(container.getIntake().getCurrentState());
//@@ expect
kOuttaking
kStow
//@@ hint
Chain the two: `m_driver.b().onTrue(...).onFalse(...);`
//@@ hint
Each of the two is a `Commands.runOnce(() -> m_intake.updateState(...))`.
//@@ solution
public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_driver.a().onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)));

        m_driver.b()
            .onTrue(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kOuttaking)))
            .onFalse(Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));
    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ explain
`onTrue` handles the press and `onFalse` handles the release. Without `onFalse`, the intake would keep outtaking forever once you let go.
```

!!! tip "A lesson from our own code"
    You may find `toggleOnTrue`, a WPILib binding that starts something on the first press and stops it on the next. Our `RobotContainer` doesn't use it. A comment in the code says, "if anyone is reading this, here's a lesson: don't use WPILib toggle, it's not good." Our intake button instead sets a robot action through `RobotState` and watches that action, so the button always matches what the robot is really doing. You'll see how on the [RobotState](robotState.md) page.

### Bindings that call RobotState

The intake button above is a simplification. On the real robot, one button press usually changes several subsystems at once, so the binding doesn't call a subsystem. It tells `RobotState` what the robot should be doing.

```java title="A real binding from our RobotContainer"
m_driverControls
    .coralEject()
    .onTrue(
        Commands.runOnce(
            () -> {
              RobotState.getInstance().updateRobotAction(RobotAction.kCoralEject);
            }))
    .onFalse(
        Commands.runOnce(
            () -> {
              RobotState.getInstance().setDefaultAction();
            }));
```

Same shape as the B button: something on press, something else on release. It just talks to a different object. The next page explains it.

### Zeroing while the robot is disabled

Commands don't run while the robot is disabled, which is a safety feature. But some things you want to do __before__ a match, while disabled, like telling the elevator "this is height zero." Our code adds `.ignoringDisable(true)` to those bindings.

```java
m_driverControls
    .zeroElevator()
    .onTrue(
        Commands.runOnce(() -> m_elevator.zeroElevator())
            .ignoringDisable(true));
```

Try it. This container is set to disabled before the button is pressed, so the zero command is silently ignored.

```playground
//@ title: Zero while disabled
//@ prelude: wpilib
//@ goal: Pressing START should zero the elevator even while the robot is disabled. Right now it does nothing. Fix the binding.
//@ lines: 22
//@ require: ignoringDisable\(\s*true\s*\) | Add .ignoringDisable(true) to the command.
public class Elevator {
    private int m_zeroCount = 0;

    public void zero() { m_zeroCount++; }

    public int getZeroCount() { return m_zeroCount; }
}

public class RobotContainer {
    private final Elevator m_elevator = new Elevator();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_driver.start().onTrue(Commands.runOnce(() -> m_elevator.zero()));
    }

    public Elevator getElevator() {
        return m_elevator;
    }
}
//@@ harness
Sim.setMode("disabled");
RobotContainer container = new RobotContainer();
Sim.press(0, "START");
Sim.loops(2);
System.out.println(container.getElevator().getZeroCount());
//@@ expect
1
//@@ hint
Add one call onto the end of `Commands.runOnce(...)`, before the closing parenthesis of `onTrue`.
//@@ solution
public class Elevator {
    private int m_zeroCount = 0;

    public void zero() { m_zeroCount++; }

    public int getZeroCount() { return m_zeroCount; }
}

public class RobotContainer {
    private final Elevator m_elevator = new Elevator();
    private final CommandXboxController m_driver = new CommandXboxController(0);

    public RobotContainer() {
        m_driver.start().onTrue(Commands.runOnce(() -> m_elevator.zero()).ignoringDisable(true));
    }

    public Elevator getElevator() {
        return m_elevator;
    }
}
//@@ explain
Commands don't run when the robot is disabled unless you say they may. Zeroing a sensor is exactly the kind of thing you want to do before the match starts.
```

## Driving: the default command

Driving is where we __do__ use commands. Most subsystems sit idle until a button asks for them, but the drivetrain should respond to the sticks all the time. So it gets a __default command__: the command that runs whenever nothing else is using that subsystem.

Driving commands live in `commands/drive/DriveCommands.java` as static methods, not inside the subsystem. They take their inputs as suppliers, the live lambdas from [FRC Nuances](frcProgramming.md), so they read the sticks fresh every loop. Notice `m_driverControls::getForward`, a method reference, passed in where a live value is needed.

```playground
//@ title: A drivetrain with a default command
//@ panel: robot
//@ show: controller,motors,dashboard
//@ goal: Run it, switch to Teleop, and drive: left stick up for forward, right stick sideways to turn. Then remove the minus sign in getTurn() and see which way it turns.
//@ lines: 60
//@ maxlines: 34
public class Drive extends SubsystemBase {
    private final TalonFX m_left = new TalonFX(1);
    private final TalonFX m_right = new TalonFX(2);
    private final DifferentialDrive m_drive = new DifferentialDrive(m_left, m_right);

    public void arcadeDrive(double forward, double turn) {
        m_drive.arcadeDrive(forward, turn);
    }
}

public class DriveCommands {
    private DriveCommands() {}

    public static Command arcade(Drive drive, DoubleSupplier forward, DoubleSupplier turn) {
        return Commands.run(
            () -> drive.arcadeDrive(forward.getAsDouble(), turn.getAsDouble()),
            drive);
    }
}

public interface DriverControls {
    double getForward();

    double getTurn();
}

public class DriverControlsXbox implements DriverControls {
    private final CommandXboxController m_controller = new CommandXboxController(0);

    @Override
    public double getForward() {
        return -m_controller.getLeftY();
    }

    @Override
    public double getTurn() {
        return -m_controller.getRightX();
    }
}

public class RobotContainer {
    private final Drive m_drive = new Drive();
    private final DriverControls m_driverControls = new DriverControlsXbox();

    public RobotContainer() {
        m_drive.setDefaultCommand(
            DriveCommands.arcade(m_drive, m_driverControls::getForward, m_driverControls::getTurn));
    }
}
```

Our real drivetrain is a swerve drive, which is a lot more math, but it hooks up the same way: a `joystickDrive` command is set as the drivetrain's default command, fed by `getForward`, `getStrafe` and `getTurn`.

```quiz
@ title: Controllers and driving
? Why does `getForward()` return `-m_controller.getLeftY()`?
- The controller is broken
+ Pushing a stick forward reads negative, so the controller class flips it once, in one place
- Negative numbers are faster
- WPILib requires it
> Forward is negative on Y. Flipping it inside the controller class means nobody else has to remember.

? Why do drive commands take `m_driverControls::getForward` instead of `m_driverControls.getForward()`?
- It runs faster
+ The command needs to read the stick again on every loop, not once
- Java requires method references for suppliers
- To hide the controller
> Without a supplier you'd capture the stick's value at one instant and the robot would never respond to it moving.

? Which statement about a default command is true?
- It runs once when the robot turns on
+ It runs whenever nothing else is using that subsystem
- It makes the subsystem ignore other commands
- Every subsystem must have one
> It's perfect for driving. Pressing a button that needs the drivetrain interrupts it, and it resumes afterwards.
```

## Autonomous: getAutonomousCommand()

During autonomous nobody touches the controllers, so the robot runs a pre-planned routine. In code, a routine is just __one command__, usually several small ones chained together. `RobotContainer` hands it over in `getAutonomousCommand()`, and `Robot.java` schedules it when autonomous starts.

Because our subsystems run on states, an autonomous step is often just "set a state," then wait. Two helpers chain the steps:

- `Commands.waitSeconds(seconds)` does nothing for that long.
- `Commands.sequence(a, b, c)` runs `a`, then `b`, then `c`.

Here is a complete example, `Robot.java` included. Run it, switch to __Auto__, and watch `Intake/State`. It intakes for a second and then stows by itself. Switch to __Teleop__ and any unfinished autonomous command is cancelled.

```playground
//@ title: A simple autonomous
//@ panel: robot
//@ show: dashboard,scheduler
//@ goal: Run it and switch to Auto: the intake runs for 1 second, then stows. Change the wait, or add a second step.
//@ lines: 110
//@ maxlines: 34
public interface IntakeIO {
    @AutoLog
    public static class IntakeInputs {
        public double velocityRPS;
        public double voltage;
    }

    public void updateInputs(IntakeInputs inputs);

    public void setVoltage(double voltage);
}

public class IntakeIOSim implements IntakeIO {
    private double m_voltage = 0.0;
    private double m_velocity = 0.0;

    @Override
    public void updateInputs(IntakeInputs inputs) {
        m_velocity += (m_voltage * 8.0 - m_velocity) * 0.2;
        inputs.velocityRPS = m_velocity;
        inputs.voltage = m_voltage;
    }

    @Override
    public void setVoltage(double voltage) {
        m_voltage = voltage;
    }
}

public class Intake extends SubsystemBase {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private final IntakeIO m_io;
    private final IntakeInputsAutoLogged m_inputs = new IntakeInputsAutoLogged();
    private final SubsystemProfiles<IntakeState> m_profiles;

    public Intake(IntakeIO io) {
        m_io = io;

        Map<IntakeState, Runnable> periodicHash = new HashMap<>();
        periodicHash.put(IntakeState.kStow, this::stowPeriodic);
        periodicHash.put(IntakeState.kIntaking, this::intakingPeriodic);
        periodicHash.put(IntakeState.kOuttaking, this::outtakingPeriodic);

        m_profiles = new SubsystemProfiles<>(periodicHash, IntakeState.kStow);
    }

    public void updateState(IntakeState state) {
        m_profiles.setCurrentProfile(state);
    }

    public IntakeState getCurrentState() {
        return m_profiles.getCurrentProfile();
    }

    @Override
    public void periodic() {
        m_io.updateInputs(m_inputs);
        m_profiles.getPeriodicFunctionTimed().run();
        Logger.processInputs("Intake", m_inputs);
        Logger.recordOutput("Intake/State", m_profiles.getCurrentProfile());
    }

    public void stowPeriodic() {
        m_io.setVoltage(0.0);
    }

    public void intakingPeriodic() {
        m_io.setVoltage(8.0);
    }

    public void outtakingPeriodic() {
        m_io.setVoltage(-8.0);
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake(new IntakeIOSim());

    public Command getAutonomousCommand() {
        return Commands.sequence(
            Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)),
            Commands.waitSeconds(1.0),
            Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));
    }
}

public class Robot extends LoggedRobot {
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

On the real robot there isn't one routine, there's a menu. `RobotContainer` builds a chooser the drivers use on the dashboard, and `getAutonomousCommand()` returns whichever was picked.

```java title="configureCommands(), shortened"
m_autoChooser = new LoggedDashboardChooser<>("Auto Chooser");
m_autoFactory = new AutoFactory(m_drive);

m_autoChooser.addOption("Do Nothing", Commands.none());
m_autoChooser.addDefaultOption("3 Coral Left", m_autoFactory.getAutoCommand("3 Coral Left"));

// every path drawn in PathPlanner shows up as an option too
for (String path : PathPlannerUtil.getExistingPaths()) {
    m_autoChooser.addOption(path, m_autoFactory.getAutoCommand(path));
}
```

```java title="getAutonomousCommand()"
public Command getAutonomousCommand() {
    return m_autoChooser.get();
}
```

`AutoFactory` also teaches PathPlanner the names of our actions, like "Set Height L1", each one a `Commands.runOnce` that sets something in `RobotState`. So a routine drawn in PathPlanner can say "drive here, set L1, score" and the same state machine does the work.

Now build one. Make this routine intake for 2 seconds, then outtake for 1 second, then stow.

```playground
//@ title: Build an autonomous routine
//@ prelude: wpilib
//@ goal: Build the routine: intake for 2 seconds, outtake for 1 second, then stow. Use Commands.sequence, runOnce and waitSeconds.
//@ lines: 36
//@ maxlines: 30
//@ require: waitSeconds | Use Commands.waitSeconds(...) for the waiting.
//@ require: sequence|andThen | Chain the steps with Commands.sequence(...) or andThen(...).
public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();

    public Command getAutonomousCommand() {
        // Build the routine here
        return Commands.none();
    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ harness
RobotContainer container = new RobotContainer();
container.getAutonomousCommand().schedule();
Sim.loops(10);
System.out.println(container.getIntake().getCurrentState());
Sim.loops(110);
System.out.println(container.getIntake().getCurrentState());
Sim.loops(80);
System.out.println(container.getIntake().getCurrentState());
//@@ expect
kIntaking
kOuttaking
kStow
//@@ hint
The routine is five steps: set intaking, wait, set outtaking, wait, set stow.
//@@ hint
Each "set" is `Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking))` with a different state. Each wait is `Commands.waitSeconds(2.0)`.
//@@ solution
public class Intake {
    public static enum IntakeState {
        kStow,
        kIntaking,
        kOuttaking
    }

    private IntakeState m_state = IntakeState.kStow;

    public void updateState(IntakeState state) {
        m_state = state;
    }

    public IntakeState getCurrentState() {
        return m_state;
    }
}

public class RobotContainer {
    private final Intake m_intake = new Intake();

    public Command getAutonomousCommand() {
        return Commands.sequence(
            Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kIntaking)),
            Commands.waitSeconds(2.0),
            Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kOuttaking)),
            Commands.waitSeconds(1.0),
            Commands.runOnce(() -> m_intake.updateState(Intake.IntakeState.kStow)));
    }

    public Intake getIntake() {
        return m_intake;
    }
}
//@@ explain
An autonomous routine is a timeline of state changes. The subsystems do the actual work in their `periodic()` methods, the same as in teleop.
```

## What belongs where?

Now that you've seen every part of `RobotContainer`, test your sense of where things go.

```quiz
@ title: RobotContainer
? Which of these belongs in `RobotContainer`?
- The code that sets the intake motor's voltage
+ The line that makes the A button change the intake's state
- The intake motor's CAN id
- The code that calls `periodic()` on each subsystem
> Subsystems hold the "how", constants hold the numbers, and `RobotContainer` connects the buttons.

? Which file is the only one that needs to change when the team moves "outtake" from the B button to the Y button?
- `Intake.java`
- `RobotContainer.java`
+ `DriverControlsXbox.java`
- `Constants.java`
> `RobotContainer` asks for `outtake()`. Which button that is lives in the controller class.

? A button binding for "hold to run, release to stop" needs:
- Only `onTrue`
+ `onTrue` for the press and `onFalse` for the release
- `toggleOnTrue`
- Nothing, it's automatic
> Without `onFalse`, nothing ever tells the mechanism to stop.

? You want a button to zero the elevator before a match, while the robot is still disabled. What must you add?
- `.onFalse(...)`
+ `.ignoringDisable(true)` on the command
- `.whileTrue(...)`
- Nothing, commands always run
> Commands don't run while disabled unless they say they may.

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
> Forward is negative on Y, which is why the controller class negates it.
```

---

## What's next

You've seen how the robot is assembled and how buttons reach it. The last piece is what happens when a button is pressed and several subsystems need to change together. That's the job of [RobotState](robotState.md).
