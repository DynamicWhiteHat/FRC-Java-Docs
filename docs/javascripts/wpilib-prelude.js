/*
 * A tiny pretend-WPILib for the in-browser Java playground.
 *
 * This is NOT the real WPILib. It re-creates just enough of the command-based
 * framework (subsystems, commands, triggers, the scheduler, a motor controller
 * and an Xbox controller) so that students can write real-looking FRC code and
 * watch it behave. Class and method names match WPILib / vendor libraries so
 * the code students write here is the code they would write on the robot.
 *
 * Fields that students' subclasses might clash with are prefixed with "_".
 * `Host.emit(...)` records events the page uses to draw the robot panel.
 * `Sim` is the harness: it presses buttons and runs scheduler loops.
 */
(function (root) {
  var MJ = root.MiniJava || (typeof require !== 'undefined' ? require('./minijava.js') : null);
  var src = String.raw`
interface Subsystem {}
interface MotorController { void set(double speed); }

class MotorType {
  public static final String kBrushless = "kBrushless";
  public static final String kBrushed = "kBrushed";
}

class MathUtil {
  public static double clamp(double value, double low, double high) {
    return Math.max(low, Math.min(value, high));
  }
  public static int clamp(int value, int low, int high) {
    return Math.max(low, Math.min(value, high));
  }
  public static double applyDeadband(double value, double deadband) {
    if (Math.abs(value) > deadband) {
      if (value > 0.0) { return (value - deadband) / (1.0 - deadband); }
      return (value + deadband) / (1.0 - deadband);
    }
    return 0.0;
  }
}

class SmartDashboard {
  private static HashMap<String, Double> _numbers = new HashMap<>();
  private static HashMap<String, Boolean> _booleans = new HashMap<>();
  private static HashMap<String, String> _strings = new HashMap<>();
  public static boolean putNumber(String key, double value) { _numbers.put(key, value); Host.emit("dash", key, value); return true; }
  public static boolean putBoolean(String key, boolean value) { _booleans.put(key, value); Host.emit("dash", key, value); return true; }
  public static boolean putString(String key, String value) { _strings.put(key, value); Host.emit("dash", key, value); return true; }
  public static double getNumber(String key, double defaultValue) { return _numbers.getOrDefault(key, defaultValue); }
  public static boolean getBoolean(String key, boolean defaultValue) { return _booleans.getOrDefault(key, defaultValue); }
  public static String getString(String key, String defaultValue) { return _strings.getOrDefault(key, defaultValue); }
}

/* ---------------- hardware ---------------- */

class IdleMode {
  public static final String kBrake = "kBrake";
  public static final String kCoast = "kCoast";
}
class ResetMode {
  public static final String kResetSafeParameters = "kResetSafeParameters";
  public static final String kNoResetSafeParameters = "kNoResetSafeParameters";
}
class PersistMode {
  public static final String kPersistParameters = "kPersistParameters";
  public static final String kNoPersistParameters = "kNoPersistParameters";
}
class SparkMaxConfig {
  public boolean _inverted = false;
  public String _idle = "kCoast";
  public int _limit = 80;
  public SparkMaxConfig inverted(boolean inverted) { _inverted = inverted; return this; }
  public SparkMaxConfig idleMode(String mode) { _idle = mode; return this; }
  public SparkMaxConfig smartCurrentLimit(int amps) { _limit = amps; return this; }
}

class SparkMax implements MotorController {
  private int _id;
  private double _speed = 0.0;
  private boolean _inverted = false;
  private String _idle = "kCoast";
  public SparkMax(int deviceId, String type) {
    _id = deviceId;
    Host.emit("motor", _id, 0.0);
  }
  public void configure(SparkMaxConfig config, String reset, String persist) {
    _inverted = config._inverted;
    _idle = config._idle;
    Host.emit("config", _id, config._inverted, config._idle, config._limit);
  }
  public void set(double speed) {
    _speed = MathUtil.clamp(speed, -1.0, 1.0);
    if (_inverted) { Host.emit("motor", _id, -_speed); Sim.setMotorOutput(_id, -_speed); }
    else { Host.emit("motor", _id, _speed); Sim.setMotorOutput(_id, _speed); }
  }
  public double get() { return _speed; }
  public void setVoltage(double volts) { set(volts / 12.0); }
  public void stopMotor() { set(0.0); }
  public void setInverted(boolean inverted) { _inverted = inverted; }
  public int getDeviceId() { return _id; }
}
class CANSparkMax extends SparkMax {}

/* A "request" you hand a TalonFX / Kraken: spin at this many volts (a battery is about 12 V). */
class VoltageOut {
  private double _output;
  public VoltageOut(double output) { _output = output; }
  public VoltageOut withOutput(double output) { _output = output; return this; }
  public VoltageOut withEnableFOC(boolean enable) { return this; }
  public double getOutput() { return _output; }
}

class TalonFX implements MotorController {
  private int _id;
  private double _speed = 0.0;
  private boolean _inverted = false;
  public TalonFX(int deviceId) {
    _id = deviceId;
    Host.emit("motor", _id, 0.0);
  }
  public TalonFX(int deviceId, String canbus) { this(deviceId); }
  public void setControl(VoltageOut request) { set(request.getOutput() / 12.0); }
  public void set(double speed) {
    _speed = MathUtil.clamp(speed, -1.0, 1.0);
    if (_inverted) { Host.emit("motor", _id, -_speed); Sim.setMotorOutput(_id, -_speed); }
    else { Host.emit("motor", _id, _speed); Sim.setMotorOutput(_id, _speed); }
  }
  public double get() { return _speed; }
  public void stopMotor() { set(0.0); }
  public void setInverted(boolean inverted) { _inverted = inverted; }
  public int getDeviceId() { return _id; }
}

class DigitalInput {
  private int _channel;
  public DigitalInput(int channel) { _channel = channel; }
  public boolean get() { return Sim.getDigital(_channel); }
}

class DifferentialDrive {
  private MotorController _left;
  private MotorController _right;
  public DifferentialDrive(MotorController leftMotor, MotorController rightMotor) {
    _left = leftMotor;
    _right = rightMotor;
  }
  /* Same math as WPILib 2023+: positive zRotation is counterclockwise (a left turn). */
  public void arcadeDrive(double xSpeed, double zRotation) {
    xSpeed = MathUtil.applyDeadband(MathUtil.clamp(xSpeed, -1.0, 1.0), 0.02);
    zRotation = MathUtil.applyDeadband(MathUtil.clamp(zRotation, -1.0, 1.0), 0.02);
    xSpeed = Math.copySign(xSpeed * xSpeed, xSpeed);
    zRotation = Math.copySign(zRotation * zRotation, zRotation);
    double greaterInput = Math.max(Math.abs(xSpeed), Math.abs(zRotation));
    double lesserInput = Math.min(Math.abs(xSpeed), Math.abs(zRotation));
    if (greaterInput == 0.0) {
      _left.set(0.0);
      _right.set(0.0);
      return;
    }
    double saturatedInput = (greaterInput + lesserInput) / greaterInput;
    double leftSpeed = (xSpeed - zRotation) / saturatedInput;
    double rightSpeed = (xSpeed + zRotation) / saturatedInput;
    _left.set(leftSpeed);
    _right.set(rightSpeed);
  }
  public void tankDrive(double leftSpeed, double rightSpeed) {
    leftSpeed = MathUtil.applyDeadband(MathUtil.clamp(leftSpeed, -1.0, 1.0), 0.02);
    rightSpeed = MathUtil.applyDeadband(MathUtil.clamp(rightSpeed, -1.0, 1.0), 0.02);
    _left.set(Math.copySign(leftSpeed * leftSpeed, leftSpeed));
    _right.set(Math.copySign(rightSpeed * rightSpeed, rightSpeed));
  }
  public void stopMotor() {
    _left.set(0.0);
    _right.set(0.0);
  }
}

/* ---------------- logging & team utilities (AdvantageKit-style) ---------------- */

/* Every "<Name>AutoLogged" inputs class implements this. The page writes those classes for
   you from @AutoLog, the same way AdvantageKit does it when the robot code is built. */
interface LoggableInputs { void toLog(String prefix); }

/* On a real robot, Logger writes everything to a log file you can replay later.
   Here, everything you log shows up in the SmartDashboard panel. */
class Logger {
  public static void recordOutput(String key, double value) { Host.emit("dash", key, value); }
  public static void recordOutput(String key, int value) { Host.emit("dash", key, (double) value); }
  public static void recordOutput(String key, boolean value) { Host.emit("dash", key, value); }
  public static void recordOutput(String key, String value) { Host.emit("dash", key, value); }
  public static void recordOutput(String key, Object value) { Host.emit("dash", key, "" + value); }
  public static void processInputs(String key, LoggableInputs inputs) { inputs.toLog(key); }
}

/* Robot classes extend LoggedRobot instead of TimedRobot so everything can be logged. */
class LoggedRobot extends TimedRobot {}

class RobotBase {
  public static boolean isReal() { return false; }
  public static boolean isSimulation() { return true; }
}

/* A number you can tune from the dashboard while the robot runs. */
class LoggedTunableNumber implements DoubleSupplier {
  private String _key;
  private double _value;
  private Map<Integer, Double> _lastSeen = new HashMap<>();
  public LoggedTunableNumber(String dashboardKey, double defaultValue) { _key = "/Tuning/" + dashboardKey; _value = defaultValue; }
  public double get() { return _value; }
  public double getAsDouble() { return _value; }
  /* On the real robot you change the number by typing in the dashboard. Here you call set(). */
  public void set(double value) { _value = value; }
  /* True the first time it's asked, and again whenever the number has changed since the last ask from this id. */
  public boolean hasChanged(int id) {
    double current = get();
    Double last = _lastSeen.get(id);
    if (last == null || current != last) { _lastSeen.put(id, current); return true; }
    return false;
  }
  /* Runs the action if any of these numbers changed since the last time this id checked. */
  public static void ifChanged(int id, Runnable action, LoggedTunableNumber... tunableNumbers) {
    boolean changed = false;
    for (LoggedTunableNumber n : tunableNumbers) { if (n.hasChanged(id)) { changed = true; } }
    if (changed) { action.run(); }
  }
}

/* A tiny state machine: one enum of states, and the method to run for each one. */
class SubsystemProfiles<T extends Enum<T>> {
  private T _current;
  private T _last;
  private Map<T, Runnable> _periodic;
  public SubsystemProfiles(Map<T, Runnable> profilePeriodicFunctions, T defaultProfile) {
    if (defaultProfile == null) { throw new IllegalArgumentException("Default profile cannot be null"); }
    _periodic = profilePeriodicFunctions;
    _current = defaultProfile;
    _last = defaultProfile;
  }
  public void setCurrentProfile(T profile) { _last = _current; _current = profile; }
  public T getCurrentProfile() { return _current; }
  public Runnable getPeriodicFunction() {
    return _periodic.getOrDefault(_current, () -> System.out.println("WARNING: No periodic function for profile " + _current));
  }
  public Runnable getPeriodicFunctionTimed() { return getPeriodicFunction(); }
  public void revertToLastProfile() { setCurrentProfile(_last); }
}

/* ---------------- command-based framework ---------------- */

class Command {
  private ArrayList<SubsystemBase> _requirements = new ArrayList<>();
  private boolean _runsDisabled = false;
  public void initialize() {}
  public void execute() {}
  public boolean isFinished() { return false; }
  public void end(boolean interrupted) {}
  public boolean runsWhenDisabled() { return _runsDisabled; }
  public Command ignoringDisable(boolean disable) { _runsDisabled = disable; return this; }
  public void addRequirements(Subsystem... subsystems) {
    for (Subsystem s : subsystems) { _requirements.add(s); }
  }
  public ArrayList<SubsystemBase> getRequirements() { return _requirements; }
  public boolean requires(Subsystem s) { return _requirements.contains(s); }
  public String getName() { return getClass().getSimpleName(); }
  public void schedule() { CommandScheduler.getInstance().schedule(this); }
  public void cancel() { CommandScheduler.getInstance().cancel(this); }
  public boolean isScheduled() { return CommandScheduler.getInstance().isScheduled(this); }
  public Command andThen(Command next) { return new SequentialCommandGroup(this, next); }
  public Command withTimeout(double seconds) { return new TimeoutCommand(this, seconds); }
}

class TimeoutCommand extends Command {
  private Command _inner;
  private int _ticks;
  private int _count = 0;
  public TimeoutCommand(Command inner, double seconds) {
    _inner = inner;
    _ticks = (int) (seconds * 50.0);
    for (Subsystem s : inner.getRequirements()) { addRequirements(s); }
  }
  public String getName() { return _inner.getName(); }
  public void initialize() { _count = 0; _inner.initialize(); }
  public void execute() { _inner.execute(); _count++; }
  public boolean isFinished() { return _inner.isFinished() || _count >= _ticks; }
  public void end(boolean interrupted) { _inner.end(interrupted); }
}

class SubsystemBase implements Subsystem {
  public SubsystemBase() { CommandScheduler.getInstance().registerSubsystem(this); }
  public void periodic() {}
  public void simulationPeriodic() {}
  public String getName() { return getClass().getSimpleName(); }
  public void setDefaultCommand(Command command) { CommandScheduler.getInstance().setDefaultCommand(this, command); }
  public Command run(Runnable action) { return new RunCommand(action, this); }
  public Command runOnce(Runnable action) { return new InstantCommand(action, this); }
  public Command startEnd(Runnable start, Runnable end) { return new StartEndCommand(start, end, this); }
  public Command runEnd(Runnable run, Runnable end) { return new RunEndCommand(run, end, this); }
}

class InstantCommand extends Command {
  private Runnable _toRun;
  public InstantCommand(Runnable toRun, Subsystem... requirements) {
    _toRun = toRun;
    addRequirements(requirements);
  }
  public void initialize() { _toRun.run(); }
  public boolean isFinished() { return true; }
}

class RunCommand extends Command {
  private Runnable _toRun;
  public RunCommand(Runnable toRun, Subsystem... requirements) {
    _toRun = toRun;
    addRequirements(requirements);
  }
  public void execute() { _toRun.run(); }
}

class StartEndCommand extends Command {
  private Runnable _onInit;
  private Runnable _onEnd;
  public StartEndCommand(Runnable onInit, Runnable onEnd, Subsystem... requirements) {
    _onInit = onInit;
    _onEnd = onEnd;
    addRequirements(requirements);
  }
  public void initialize() { _onInit.run(); }
  public void end(boolean interrupted) { _onEnd.run(); }
}

class RunEndCommand extends Command {
  private Runnable _onRun;
  private Runnable _onEnd;
  public RunEndCommand(Runnable onRun, Runnable onEnd, Subsystem... requirements) {
    _onRun = onRun;
    _onEnd = onEnd;
    addRequirements(requirements);
  }
  public void execute() { _onRun.run(); }
  public void end(boolean interrupted) { _onEnd.run(); }
}

class WaitCommand extends Command {
  private int _ticks;
  private int _count = 0;
  public WaitCommand(double seconds) { _ticks = (int) (seconds * 50.0); }
  public void initialize() { _count = 0; }
  public void execute() { _count++; }
  public boolean isFinished() { return _count >= _ticks; }
}

class SequentialCommandGroup extends Command {
  private ArrayList<Command> _commands = new ArrayList<>();
  private int _index = 0;
  public SequentialCommandGroup(Command... commands) {
    for (Command c : commands) {
      _commands.add(c);
      for (Subsystem s : c.getRequirements()) { addRequirements(s); }
    }
  }
  public void initialize() {
    _index = 0;
    if (_commands.size() > 0) { _commands.get(0).initialize(); }
  }
  public void execute() {
    if (_index >= _commands.size()) { return; }
    Command current = _commands.get(_index);
    current.execute();
    if (current.isFinished()) {
      current.end(false);
      _index++;
      if (_index < _commands.size()) { _commands.get(_index).initialize(); }
    }
  }
  public boolean isFinished() { return _index >= _commands.size(); }
  public void end(boolean interrupted) {
    if (interrupted && _index < _commands.size()) { _commands.get(_index).end(true); }
  }
}

class Commands {
  public static Command none() { return new InstantCommand(() -> {}); }
  public static Command run(Runnable action, Subsystem... requirements) { return new RunCommand(action, requirements); }
  public static Command runOnce(Runnable action, Subsystem... requirements) { return new InstantCommand(action, requirements); }
  public static Command startEnd(Runnable start, Runnable end, Subsystem... requirements) { return new StartEndCommand(start, end, requirements); }
  public static Command runEnd(Runnable run, Runnable end, Subsystem... requirements) { return new RunEndCommand(run, end, requirements); }
  public static Command waitSeconds(double seconds) { return new WaitCommand(seconds); }
  public static Command sequence(Command... commands) { return new SequentialCommandGroup(commands); }
}

class Trigger {
  private BooleanSupplier _cond;
  private boolean _last = false;
  private boolean _registered = false;
  private ArrayList<Command> _onTrue = new ArrayList<>();
  private ArrayList<Command> _onFalse = new ArrayList<>();
  private ArrayList<Command> _whileTrue = new ArrayList<>();
  private ArrayList<Command> _toggle = new ArrayList<>();
  public Trigger(BooleanSupplier condition) { _cond = condition; }
  private void register() {
    if (!_registered) {
      _registered = true;
      CommandScheduler.getInstance().registerTrigger(this);
    }
  }
  public Trigger onTrue(Command command) { _onTrue.add(command); register(); return this; }
  public Trigger onFalse(Command command) { _onFalse.add(command); register(); return this; }
  public Trigger whileTrue(Command command) { _whileTrue.add(command); register(); return this; }
  public Trigger toggleOnTrue(Command command) { _toggle.add(command); register(); return this; }
  public boolean getAsBoolean() { return _cond.getAsBoolean(); }
  public Trigger and(BooleanSupplier other) { return new Trigger(() -> _cond.getAsBoolean() && other.getAsBoolean()); }
  public Trigger or(BooleanSupplier other) { return new Trigger(() -> _cond.getAsBoolean() || other.getAsBoolean()); }
  public Trigger negate() { return new Trigger(() -> !_cond.getAsBoolean()); }
  public void poll() {
    boolean now = _cond.getAsBoolean();
    if (now && !_last) {
      for (Command c : _onTrue) { c.schedule(); }
      for (Command c : _whileTrue) { c.schedule(); }
      for (Command c : _toggle) {
        if (c.isScheduled()) { c.cancel(); } else { c.schedule(); }
      }
    }
    if (!now && _last) {
      for (Command c : _onFalse) { c.schedule(); }
      for (Command c : _whileTrue) { c.cancel(); }
    }
    _last = now;
  }
}

class CommandScheduler {
  private static CommandScheduler _instance = null;
  public static CommandScheduler getInstance() {
    if (_instance == null) { _instance = new CommandScheduler(); }
    return _instance;
  }
  private ArrayList<SubsystemBase> _subsystems = new ArrayList<>();
  private ArrayList<Command> _scheduled = new ArrayList<>();
  private ArrayList<Trigger> _triggers = new ArrayList<>();
  private ArrayList<SubsystemBase> _defaultOwners = new ArrayList<>();
  private ArrayList<Command> _defaultCommands = new ArrayList<>();
  private int _loopCount = 0;

  public void registerSubsystem(SubsystemBase subsystem) { _subsystems.add(subsystem); }
  public void registerTrigger(Trigger trigger) { _triggers.add(trigger); }
  public void setDefaultCommand(SubsystemBase subsystem, Command command) {
    _defaultOwners.add(subsystem);
    _defaultCommands.add(command);
  }
  public boolean isScheduled(Command command) { return _scheduled.contains(command); }
  private Command commandRequiring(Subsystem subsystem) {
    for (Command c : _scheduled) {
      if (c.requires(subsystem)) { return c; }
    }
    return null;
  }
  public void schedule(Command command) {
    if (!Sim.isEnabled() && !command.runsWhenDisabled()) { return; }
    if (_scheduled.contains(command)) { return; }
    for (Subsystem s : command.getRequirements()) {
      Command other = commandRequiring(s);
      if (other != null) { cancel(other); }
    }
    _scheduled.add(command);
    Host.emit("cmd", "start", command.getName());
    command.initialize();
  }
  public void cancel(Command command) {
    if (!_scheduled.contains(command)) { return; }
    _scheduled.remove(command);
    command.end(true);
    Host.emit("cmd", "interrupted", command.getName());
  }
  public void run() {
    _loopCount++;
    Host.emit("loop", _loopCount);
    for (SubsystemBase s : _subsystems) { s.periodic(); }
    for (Trigger t : _triggers) { t.poll(); }
    if (!Sim.isEnabled()) {
      ArrayList<Command> all = new ArrayList<>(_scheduled);
      for (Command c : all) { if (!c.runsWhenDisabled()) { cancel(c); } }
    }
    ArrayList<Command> snapshot = new ArrayList<>(_scheduled);
    for (Command c : snapshot) {
      if (!_scheduled.contains(c)) { continue; }
      c.execute();
      if (c.isFinished()) {
        _scheduled.remove(c);
        c.end(false);
        Host.emit("cmd", "finished", c.getName());
      }
    }
    for (int i = 0; i < _defaultOwners.size(); i++) {
      if (commandRequiring(_defaultOwners.get(i)) == null) { schedule(_defaultCommands.get(i)); }
    }
  }
}

/* ---------------- driver station & robot ---------------- */

class CommandXboxController {
  private int _port;
  public CommandXboxController(int port) { _port = port; }
  private Trigger btn(String name) { return new Trigger(() -> Sim.isPressed(_port, name)); }
  public Trigger a() { return btn("A"); }
  public Trigger b() { return btn("B"); }
  public Trigger x() { return btn("X"); }
  public Trigger y() { return btn("Y"); }
  public Trigger leftBumper() { return btn("LB"); }
  public Trigger rightBumper() { return btn("RB"); }
  public Trigger start() { return btn("START"); }
  public Trigger back() { return btn("BACK"); }
  public double getLeftX() { return Sim.getAxis(_port, "leftX"); }
  public double getLeftY() { return Sim.getAxis(_port, "leftY"); }
  public double getRightX() { return Sim.getAxis(_port, "rightX"); }
  public double getRightY() { return Sim.getAxis(_port, "rightY"); }
  public Trigger leftTrigger() { return new Trigger(() -> Sim.getAxis(_port, "leftTrigger") > 0.5); }
  public Trigger rightTrigger() { return new Trigger(() -> Sim.getAxis(_port, "rightTrigger") > 0.5); }
  public double getLeftTriggerAxis() { return Sim.getAxis(_port, "leftTrigger"); }
  public double getRightTriggerAxis() { return Sim.getAxis(_port, "rightTrigger"); }
}

class TimedRobot {
  public void robotInit() {}
  public void robotPeriodic() {}
  public void disabledInit() {}
  public void disabledPeriodic() {}
  public void autonomousInit() {}
  public void autonomousPeriodic() {}
  public void autonomousExit() {}
  public void teleopInit() {}
  public void teleopPeriodic() {}
  public void teleopExit() {}
  public void disabledExit() {}
  public void testInit() {}
  public void testPeriodic() {}
  public void testExit() {}
  public void simulationInit() {}
  public void simulationPeriodic() {}
}

/* The "driver station" and field: presses buttons, moves sticks, runs loops. */
class Sim {
  private static HashMap<String, Boolean> _buttons = new HashMap<>();
  private static HashMap<String, Double> _axes = new HashMap<>();
  private static HashMap<Integer, Boolean> _digitals = new HashMap<>();
  private static TimedRobot _robot = null;
  private static String _mode = "teleop";
  private static String _lastMode = "";
  private static int _ticks = 0;
  private static HashMap<Integer, Double> _motorOut = new HashMap<>();
  public static void setMotorOutput(int id, double value) { _motorOut.put(id, value); }
  /* What the motor with this CAN id is being told to do right now (the test bench's view). */
  public static double getMotorOutput(int id) { return _motorOut.getOrDefault(id, 0.0); }
  public static boolean isEnabled() { return !_mode.equals("disabled"); }
  public static String getMode() { return _mode; }
  public static void setMode(String mode) { _mode = mode; Host.emit("mode", mode); }
  public static void start(TimedRobot robot) {
    _robot = robot;
    _lastMode = "";
    robot.robotInit();
  }
  /* One pass of the robot's main loop (this is what happens every 20 ms). */
  public static void tick() {
    _ticks++;
    if (_robot == null) {
      CommandScheduler.getInstance().run();
      return;
    }
    if (!_mode.equals(_lastMode)) {
      if (_lastMode.equals("teleop")) { _robot.teleopExit(); }
      if (_lastMode.equals("auto")) { _robot.autonomousExit(); }
      _lastMode = _mode;
      if (_mode.equals("teleop")) { _robot.teleopInit(); }
      else if (_mode.equals("auto")) { _robot.autonomousInit(); }
      else { _robot.disabledInit(); }
    }
    if (_mode.equals("teleop")) { _robot.teleopPeriodic(); }
    else if (_mode.equals("auto")) { _robot.autonomousPeriodic(); }
    else { _robot.disabledPeriodic(); }
    _robot.robotPeriodic();
  }
  public static void press(int port, String button) {
    _buttons.put(port + ":" + button, true);
    Host.emit("input", port, button, "pressed");
  }
  public static void release(int port, String button) {
    _buttons.put(port + ":" + button, false);
    Host.emit("input", port, button, "released");
  }
  public static boolean isPressed(int port, String button) {
    return _buttons.getOrDefault(port + ":" + button, false);
  }
  public static void setAxis(int port, String axis, double value) {
    _axes.put(port + ":" + axis, value);
    Host.emit("input", port, axis, value);
  }
  public static double getAxis(int port, String axis) {
    return _axes.getOrDefault(port + ":" + axis, 0.0);
  }
  public static void setDigital(int channel, boolean value) {
    _digitals.put(channel, value);
    Host.emit("input", channel, "DIO", value);
  }
  public static boolean getDigital(int channel) {
    return _digitals.getOrDefault(channel, false);
  }
  public static void loops(int count) {
    for (int i = 0; i < count; i++) { tick(); }
  }
}
`;
  MJ.registerPrelude('wpilib', src);
})(typeof self !== 'undefined' ? self : this);
