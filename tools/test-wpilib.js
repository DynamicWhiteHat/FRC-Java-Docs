// Run with:  node tools/test-wpilib.js
// Tests for the pretend-WPILib prelude (docs/javascripts/wpilib-prelude.js).
const MiniJava = require('../docs/javascripts/minijava.js');
require('../docs/javascripts/wpilib-prelude.js');

let pass = 0, fail = 0;
const failures = [];
function t(name, src, harness, expected) {
  const r = MiniJava.run(src, { prelude: ['wpilib'], harness });
  let got = r.output;
  if (r.error) got += (got && !got.endsWith('\n') ? '\n' : '') + `<<${r.error.kind}@${r.error.line}: ${r.error.message.split('\n')[0]}>>`;
  if (got === expected) pass++;
  else { fail++; failures.push(`✗ ${name}\n   expected: ${JSON.stringify(expected)}\n   got:      ${JSON.stringify(got)}`); }
}
function motors(src, harness) {
  const r = MiniJava.run(src, { prelude: ['wpilib'], harness });
  return { r, m: r.events.filter((e) => e.kind === 'motor').map((e) => e.args.join('=')).join(',') };
}

/* prelude loads */
t('prelude loads', '', 'System.out.println("ok");', 'ok\n');

/* a subsystem with a motor */
const intake = `
public class IntakeSubsystem extends SubsystemBase {
  private final SparkMax m_motor = new SparkMax(5, MotorType.kBrushless);
  public IntakeSubsystem() {}
  public void run() { m_motor.set(0.8); }
  public void stop() { m_motor.set(0.0); }
  public double getSpeed() { return m_motor.get(); }
  @Override public void periodic() { SmartDashboard.putNumber("intake speed", m_motor.get()); }
}`;
t('subsystem basic', intake, `IntakeSubsystem i = new IntakeSubsystem(); i.run(); System.out.println(i.getSpeed()); i.stop(); System.out.println(i.getSpeed());`, '0.8\n0.0\n');

/* subsystem command factories + RobotContainer-like wiring */
const full = intake + `
public class RobotContainer {
  private final IntakeSubsystem m_intake = new IntakeSubsystem();
  private final CommandXboxController m_driver = new CommandXboxController(0);
  public RobotContainer() { configureBindings(); }
  private void configureBindings() {
    m_driver.a().whileTrue(m_intake.startEnd(() -> m_intake.run(), () -> m_intake.stop()));
  }
}
public class Robot extends TimedRobot {
  private RobotContainer m_robotContainer;
  public Robot() { m_robotContainer = new RobotContainer(); }
  @Override public void robotPeriodic() { CommandScheduler.getInstance().run(); }
}`;
{
  const { r, m } = motors(full, `Robot robot = new Robot();
    Sim.loops(2); Sim.press(0, "A"); Sim.loops(3); Sim.release(0, "A"); Sim.loops(2);`);
  const speeds = r.events.filter((e) => e.kind === 'motor').map((e) => e.args[1]);
  const ok = !r.error && speeds.join() === '0,0.8,0' ;
  if (ok) pass++; else { fail++; failures.push('✗ whileTrue binding: ' + JSON.stringify(r.error) + ' ' + speeds.join() + ' ' + m); }
  const cmds = r.events.filter((e) => e.kind === 'cmd').map((e) => e.args.join(':')).join(',');
  if (cmds === 'start:RunCommand,interrupted:RunCommand' || cmds.startsWith('start:StartEndCommand')) pass++;
  else { fail++; failures.push('✗ whileTrue cmd events: ' + cmds); }
}

/* onTrue + InstantCommand finishing */
t('onTrue runOnce', intake + `
public class RC {
  IntakeSubsystem s = new IntakeSubsystem();
  CommandXboxController c = new CommandXboxController(0);
  RC() { c.b().onTrue(s.runOnce(() -> System.out.println("B pressed!"))); }
}`, `new RC(); Sim.press(0, "B"); Sim.loops(3); Sim.release(0, "B"); Sim.loops(1); Sim.press(0, "B"); Sim.loops(2);`, 'B pressed!\nB pressed!\n');

/* default command (drive) */
t('default command', `
public class DriveSubsystem extends SubsystemBase {
  private final SparkMax left = new SparkMax(1, MotorType.kBrushless);
  private final SparkMax right = new SparkMax(2, MotorType.kBrushless);
  private final DifferentialDrive drive = new DifferentialDrive(left, right);
  public Command arcade(DoubleSupplier fwd, DoubleSupplier rot) {
    return run(() -> drive.arcadeDrive(fwd.getAsDouble(), rot.getAsDouble()));
  }
  public double getLeft() { return left.get(); }
  public double getRight() { return right.get(); }
}`, `DriveSubsystem d = new DriveSubsystem();
  CommandXboxController c = new CommandXboxController(0);
  d.setDefaultCommand(d.arcade(() -> -c.getLeftY(), () -> -c.getRightX()));
  Sim.setAxis(0, "leftY", -1.0);
  Sim.loops(3);
  System.out.println(d.getLeft() + " " + d.getRight());
  Sim.setAxis(0, "leftY", 0.0); Sim.setAxis(0, "rightX", 0.5);
  Sim.loops(2);
  System.out.println(d.getLeft() + " " + d.getRight());`, '1.0 1.0\n0.23990004164931278 -0.23990004164931278\n');
/* Stick pushed right -> -rightX is negative zRotation -> robot turns right: left wheel forward, right wheel back.
   (WPILib 2023+ arcadeDrive is counterclockwise-positive, which is why the official examples negate getRightX().) */

/* requirements: second command interrupts first */
t('requirements interrupt', intake + `
public class Cmds { }`, `IntakeSubsystem s = new IntakeSubsystem();
  Command a = s.run(() -> System.out.println("A"));
  Command b = s.run(() -> System.out.println("B"));
  a.schedule(); Sim.loops(1); b.schedule(); Sim.loops(1);
  System.out.println(a.isScheduled() + " " + b.isScheduled());`, 'A\nB\nfalse true\n');

/* custom Command class lifecycle */
t('custom command lifecycle', intake + `
public class RunIntakeFor extends Command {
  private final IntakeSubsystem m_intake; private int count = 0;
  public RunIntakeFor(IntakeSubsystem intake) { m_intake = intake; addRequirements(intake); }
  @Override public void initialize() { System.out.println("init"); count = 0; }
  @Override public void execute() { m_intake.run(); count++; System.out.println("exec " + count); }
  @Override public boolean isFinished() { return count >= 2; }
  @Override public void end(boolean interrupted) { m_intake.stop(); System.out.println("end " + interrupted); }
}`, `IntakeSubsystem s = new IntakeSubsystem(); new RunIntakeFor(s).schedule(); Sim.loops(4);`, 'init\nexec 1\nexec 2\nend false\n');

/* sequence */
t('sequential group', intake, `IntakeSubsystem s = new IntakeSubsystem();
  Command c = Commands.sequence(Commands.runOnce(() -> System.out.println("one")), Commands.waitSeconds(0.04), Commands.runOnce(() -> System.out.println("three")));
  c.schedule(); Sim.loops(5);`, 'one\nthree\n');

/* limit switch */
t('limit switch', `
public class Arm extends SubsystemBase {
  private final SparkMax motor = new SparkMax(3, MotorType.kBrushless);
  private final DigitalInput limit = new DigitalInput(0);
  public void raise() { if (limit.get()) { motor.set(0.0); } else { motor.set(0.5); } }
  public double speed() { return motor.get(); }
}`, `Arm a = new Arm(); a.raise(); System.out.println(a.speed()); Sim.setDigital(0, true); a.raise(); System.out.println(a.speed());`, '0.5\n0.0\n');

/* periodic runs every loop, in order */
t('periodic', `
public class S extends SubsystemBase { int n = 0; @Override public void periodic() { n++; System.out.println("periodic " + n); } }`, `new S(); Sim.loops(3);`, 'periodic 1\nperiodic 2\nperiodic 3\n');

/* deadband + clamp */
t('MathUtil', '', `System.out.println(MathUtil.applyDeadband(0.05, 0.1) + " " + MathUtil.applyDeadband(0.55, 0.1) + " " + MathUtil.clamp(2.0, -1.0, 1.0) + " " + MathUtil.clamp(7, 0, 5));`, '0.0 0.5000000000000001 1.0 5\n');


/* ---- modes, enable/disable, Robot lifecycle ---- */
const robotSrc = intake + `
public class RobotContainer {
  public final IntakeSubsystem intake = new IntakeSubsystem();
  public final CommandXboxController driver = new CommandXboxController(0);
  public RobotContainer() { driver.a().whileTrue(intake.startEnd(() -> intake.run(), () -> intake.stop())); }
  public Command getAutonomousCommand() { return intake.runEnd(() -> intake.run(), () -> intake.stop()).withTimeout(0.06); }
}
public class Robot extends TimedRobot {
  private final RobotContainer m_rc;
  private Command m_auto;
  public Robot() { m_rc = new RobotContainer(); }
  @Override public void robotPeriodic() { CommandScheduler.getInstance().run(); }
  @Override public void autonomousInit() { System.out.println("auto init"); m_auto = m_rc.getAutonomousCommand(); m_auto.schedule(); }
  @Override public void teleopInit() { System.out.println("teleop init"); if (m_auto != null) { m_auto.cancel(); } }
  @Override public void teleopPeriodic() { }
  @Override public void disabledInit() { System.out.println("disabled init"); }
}`;
t('modes + auto command', robotSrc, `Sim.start(new Robot()); Sim.setMode("disabled"); Sim.loops(1);
  Sim.setMode("auto"); Sim.loops(2); System.out.println(CommandScheduler.getInstance().isScheduled(new InstantCommand(() -> {})));
  Sim.loops(5);
  Sim.setMode("teleop"); Sim.loops(1);`, 'disabled init\nauto init\nfalse\nteleop init\n');
{
  const { r } = motors(robotSrc, `Sim.start(new Robot()); Sim.setMode("auto"); Sim.loops(4); Sim.loops(4);`);
  const speeds = r.events.filter((e) => e.kind === 'motor').map((e) => e.args[1]);
  // 0 at construction, 0.8 while auto runs (3 ticks at 0.06 s = 3), then end -> 0
  const ok = !r.error && speeds[0] === 0 && speeds.includes(0.8) && speeds[speeds.length - 1] === 0;
  if (ok) pass++; else { fail++; failures.push('✗ withTimeout auto: ' + JSON.stringify(r.error) + ' ' + speeds.join()); }
}
{
  // Disabled robots ignore buttons; enabling lets them through.
  const { r } = motors(robotSrc, `Sim.start(new Robot()); Sim.setMode("disabled"); Sim.press(0, "A"); Sim.loops(3);
    Sim.setMode("teleop"); Sim.loops(1); Sim.release(0, "A"); Sim.loops(1); Sim.press(0, "A"); Sim.loops(3);`);
  const speeds = r.events.filter((e) => e.kind === 'motor').map((e) => e.args[1]);
  const ok = !r.error && speeds.join() === '0,0.8';
  if (ok) pass++; else { fail++; failures.push('✗ disabled ignores buttons: ' + JSON.stringify(r.error) + ' ' + speeds.join()); }
}

/* real REV 2025+ config API */
t('SparkMaxConfig', `
public class S extends SubsystemBase {
  private final SparkMax m = new SparkMax(4, MotorType.kBrushless);
  public S() {
    SparkMaxConfig config = new SparkMaxConfig();
    config.inverted(true).idleMode(IdleMode.kBrake).smartCurrentLimit(40);
    m.configure(config, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);
  }
  public void go() { m.set(0.5); }
}`, `S s = new S(); s.go();`, '');

/* sessions: stateful snippet execution */
{
  const s = MiniJava.createSession(intake, { prelude: ['wpilib'] });
  const a = s.exec('IntakeSubsystem.class.getSimpleName();');
  s.exec('Sim.start(null);');
  const b = s.exec('new IntakeSubsystem(); Sim.loops(2);');
  const c = s.exec('Sim.loops(1);');
  const periodic = (x) => x.events.filter((e) => e.kind === 'dash').length;
  const ok = !s.error && periodic(b) === 2 && periodic(c) === 1;
  if (ok) pass++; else { fail++; failures.push('✗ session state: ' + JSON.stringify([s.error, a.error, b, c])); }
  const bad = MiniJava.createSession('public class X { void f( }', { prelude: ['wpilib'] });
  if (bad.error && bad.error.kind === 'compile') pass++; else { fail++; failures.push('✗ session syntax error not reported'); }
}


/* @Override checking (a typo here is a classic FRC mistake) */
t('override typo', `public class S extends SubsystemBase { @Override public void periodc() {} }`, `new S();`, '<<compile@1: method does not override or implement a method from a supertype>>');
t('override ok', `public class S extends SubsystemBase { @Override public void periodic() { System.out.println("p"); } }`, `new S(); Sim.loops(1);`, 'p\n');
t('override wrong arity', `public class C extends Command { @Override public void end() {} }`, `new C();`, '<<compile@1: method does not override or implement a method from a supertype>>');
t('override real-but-unimplemented method is not flagged', `public class C extends Command { @Override public Object getInterruptionBehavior() { return null; } }`, `new C(); System.out.println("ok");`, 'ok\n');
t('override of user class method', `class A { void f() {} } class B extends A { @Override void g() {} }`, `new B();`, '<<compile@1: method does not override or implement a method from a supertype>>');
t('override toString ok', `class A { @Override public String toString() { return "A!"; } }`, `System.out.println(new A());`, 'A!\n');
t('dashboard round trip + motor output', `public class S extends SubsystemBase { SparkMax m = new SparkMax(7, MotorType.kBrushless); public void go() { m.set(0.3); } @Override public void periodic() { SmartDashboard.putNumber("v", m.get()); } }`, `S s = new S(); s.go(); Sim.loops(1); System.out.println(SmartDashboard.getNumber("v", -1.0) + " " + Sim.getMotorOutput(7) + " " + SmartDashboard.getNumber("nope", -1.0));`, '0.3 0.3 -1.0\n');

/* team-style architecture: IO interface + @AutoLog inputs + state machine (AdvantageKit-style) */
const ioSrc = `
public interface ArmIO {
  @AutoLog
  public static class ArmInputs {
    public double angleDeg;
    public boolean connected;
    public String label = "arm";
  }
  void updateInputs(ArmInputs inputs);
  void setVoltage(double volts);
}
public class ArmIOSim implements ArmIO {
  private double m_v = 0.0;
  @Override public void updateInputs(ArmInputs inputs) { inputs.angleDeg = m_v * 10.0; inputs.connected = true; }
  @Override public void setVoltage(double volts) { m_v = volts; }
}
public class Arm extends SubsystemBase {
  public static enum ArmState { kStow, kReach }
  private final ArmIO m_io;
  private final ArmInputsAutoLogged m_inputs = new ArmInputsAutoLogged();
  private final SubsystemProfiles<ArmState> m_profiles;
  public Arm(ArmIO io) {
    m_io = io;
    Map<ArmState, Runnable> map = new HashMap<>();
    map.put(ArmState.kStow, this::stow);
    map.put(ArmState.kReach, this::reach);
    m_profiles = new SubsystemProfiles<>(map, ArmState.kStow);
  }
  public void updateState(ArmState s) { m_profiles.setCurrentProfile(s); }
  public ArmState getState() { return m_profiles.getCurrentProfile(); }
  @Override public void periodic() {
    m_io.updateInputs(m_inputs);
    m_profiles.getPeriodicFunctionTimed().run();
    Logger.processInputs("Arm", m_inputs);
    Logger.recordOutput("Arm/State", m_profiles.getCurrentProfile());
  }
  private void stow() { m_io.setVoltage(0.0); }
  private void reach() { m_io.setVoltage(3.0); }
}`;
{
  const r = MiniJava.run(ioSrc, { prelude: ['wpilib'], harness: `Arm a = new Arm(new ArmIOSim()); Sim.loops(1); a.updateState(Arm.ArmState.kReach); Sim.loops(2);` });
  const d = r.events.filter((e) => e.kind === 'dash').map((e) => e.args.join('=')).join(',');
  const want = 'Arm/angleDeg=0,Arm/connected=true,Arm/label=arm,Arm/State=kStow,' +
    'Arm/angleDeg=0,Arm/connected=true,Arm/label=arm,Arm/State=kReach,' +
    'Arm/angleDeg=30,Arm/connected=true,Arm/label=arm,Arm/State=kReach';
  if (!r.error && d === want) pass++; else { fail++; failures.push('✗ AutoLogged inputs + SubsystemProfiles: ' + JSON.stringify(r.error) + '\n   ' + d); }
}
{
  // a top-level @AutoLog class (not nested in an interface) is supported too
  const r = MiniJava.run(`@AutoLog public class Flat { public int count; }`, { prelude: ['wpilib'], harness: `FlatAutoLogged f = new FlatAutoLogged(); f.count = 3; Logger.processInputs("F", f);` });
  const d = r.events.filter((e) => e.kind === 'dash').map((e) => e.args.join('=')).join(',');
  if (!r.error && d === 'F/count=3') pass++; else { fail++; failures.push('✗ top-level @AutoLog: ' + JSON.stringify(r.error) + ' ' + d); }
}
t('SubsystemProfiles: missing state warns instead of crashing', `enum S { kA, kB }`,
  `Map<S, Runnable> m = new HashMap<>(); m.put(S.kA, () -> System.out.println("A")); SubsystemProfiles<S> p = new SubsystemProfiles<>(m, S.kA); p.getPeriodicFunction().run(); p.setCurrentProfile(S.kB); p.getPeriodicFunction().run(); p.revertToLastProfile(); System.out.println(p.getCurrentProfile());`,
  'A\nWARNING: No periodic function for profile kB\nkA\n');
{
  const r = MiniJava.run(`enum S { kA }`, { prelude: ['wpilib'], harness: `SubsystemProfiles<S> p = new SubsystemProfiles<>(new HashMap<>(), null);` });
  if (r.error && /IllegalArgumentException: Default profile cannot be null/.test(r.error.message)) pass++;
  else { fail++; failures.push('✗ SubsystemProfiles null default: ' + JSON.stringify(r.error)); }
}
t('TalonFX + VoltageOut', ``, `TalonFX m = new TalonFX(4, "rio"); m.setControl(new VoltageOut(0.0).withOutput(6.0).withEnableFOC(true)); System.out.println(m.get());`, '0.5\n');
/* ifChanged: runs on the first check, then only after a number is changed (all numbers are checked, not just the first). */
t('LoggedTunableNumber ifChanged', ``,
  `LoggedTunableNumber p = new LoggedTunableNumber("P", 1.0); LoggedTunableNumber d = new LoggedTunableNumber("D", 0.0);
   int[] n = new int[1];
   for (int i = 0; i < 3; i++) { LoggedTunableNumber.ifChanged(7, () -> n[0]++, p, d); }
   System.out.println(n[0]);
   d.set(0.5); LoggedTunableNumber.ifChanged(7, () -> n[0]++, p, d); LoggedTunableNumber.ifChanged(7, () -> n[0]++, p, d);
   System.out.println(n[0]);
   p.set(2.0); d.set(0.9); LoggedTunableNumber.ifChanged(7, () -> n[0]++, p, d);
   System.out.println(n[0]);
   LoggedTunableNumber.ifChanged(8, () -> n[0]++, p, d);
   System.out.println(n[0]);`, '1\n2\n3\n4\n');
t('LoggedTunableNumber', ``,`LoggedTunableNumber n = new LoggedTunableNumber("Arm P", 2.5); DoubleSupplier s = n; System.out.println(n.get() + " " + s.getAsDouble());`, '2.5 2.5\n');
t('LoggedRobot is a TimedRobot', `public class Robot extends LoggedRobot { @Override public void robotPeriodic() { System.out.println("tick"); } }`, `Sim.start(new Robot()); Sim.loops(2);`, 'tick\ntick\n');
t('generated AutoLogged class does not shift error lines', `public interface X {\n  @AutoLog\n  public static class XInputs { public double a; }\n}\npublic class Bad { void f() { int y = zzz; } }`, `new Bad().f();`, '<<compile@5: cannot find symbol>>');

/* ignoringDisable: zeroing sensors while the robot is disabled */
{
  const src = `public class Z extends SubsystemBase { public int zeros = 0; public void zero() { zeros++; } }
  public class RC { public Z z = new Z(); public CommandXboxController c = new CommandXboxController(0);
    public RC(boolean ignore) {
      Command cmd = Commands.runOnce(() -> z.zero());
      if (ignore) { cmd = cmd.ignoringDisable(true); }
      c.start().onTrue(cmd);
    } }`;
  const run = (ignore, mode) => MiniJava.run(src, { prelude: ['wpilib'], harness: `Sim.setMode("${mode}"); RC rc = new RC(${ignore}); Sim.press(0, "START"); Sim.loops(3); System.out.println(rc.z.zeros);` }).output;
  const got = [run(false, 'disabled'), run(true, 'disabled'), run(false, 'teleop')].join('|');
  if (got === '0\n|1\n|1\n') pass++; else { fail++; failures.push('✗ ignoringDisable: ' + JSON.stringify(got)); }
}

/* helpful errors */
t('forgot extends', `public class Bad { public void periodic() {} }`, `new Bad().run(() -> {});`, '<<compile@2: cannot find symbol>>');

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log('\n' + failures.join('\n')); process.exit(1); }
