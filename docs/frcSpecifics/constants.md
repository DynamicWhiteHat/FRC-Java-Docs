# Constants

A robot is full of numbers: CAN ids, gear ratios, how far the climber can swing, how hard the elevator motor should push, how close is "close enough." If those numbers are scattered through twenty files, changing one means hunting for it, and changing it in one place but not another gives you a robot that disagrees with itself.

So we put them all in one file, `Constants.java`. On our 2025 robot it's about 900 lines, and it's the file you'll open the most while tuning.

## One class per mechanism

`Constants` doesn't hold a giant list of numbers. It holds a set of __nested classes__, one per mechanism, so the climber's numbers sit together and don't get mixed up with the elevator's.

```java title="Constants.java, shortened"
public final class Constants {
    public static final class ClimbConstants {
        public static final double kClimbTolerance = 5.0; // degrees

        public static final double kClimbReduction = (5.0 / 1.0) * (4.0 / 1.0) * (68.0 / 18.0);

        public static final Rotation2d kMinAngle = Rotation2d.fromDegrees(-350.0);
        public static final Rotation2d kMaxAngle = Rotation2d.fromDegrees(600.0);
    }

    public static final class ElevatorConstants {
        // ...
    }

    public static final class Ports {
        public static final int kClimbMotor = 36;
        public static final String kDriveCanivoreName = "Drivetrain"; // the CAN bus's name
        // ...
    }
}
```

Everything here is the `static final` combination from [FRC Nuances](frcProgramming.md): `static` so you can use it without creating an object, and `final` so nothing can change it while the robot runs. A few habits to notice:

- __Names start with `k`__ and are in camel case: `kClimbTolerance`. (This is a WPILib habit. The `k` means "constant".)
- __Units go in a comment__ whenever there are any: `// degrees`, `// meters per second`. A bare `5.0` could mean anything. There's a spot in our code where a comment says "these are magic units", and that's a warning, not an example.
- __Write gear ratios as the stages they are.__ `(5.0 / 1.0) * (4.0 / 1.0) * (68.0 / 18.0)` looks silly next to `75.56`, but it's the one you can check against the gearbox on the robot.

To use one, you reach in through the outer class, or import the inner class so you can drop the prefix:

```java
double tolerance = Constants.ClimbConstants.kClimbTolerance;

// or, with  import frc.robot.Constants.ClimbConstants;  at the top of the file:
double tolerance = ClimbConstants.kClimbTolerance;
```

Your turn. Write the nested class so `Climb` can use it.

```playground
//@ title: Write a constants class
//@ goal: Inside Constants, write a public static final class ClimbConstants with three doubles: kClimbTolerance = 5.0, kClimbStowPos = -225.0 and kClimbDeployPos = 600.0.
//@ lines: 20
//@ require: static\s+final\s+class\s+ClimbConstants | Write a public static final class named ClimbConstants inside Constants.
//@ require: double\s+kClimbTolerance | Add kClimbTolerance as a double.
public class Constants {
    // Write ClimbConstants here:

}

public class Climb {
    public boolean atSetpoint(double desiredDegrees, double currentDegrees) {
        return Math.abs(desiredDegrees - currentDegrees) < Constants.ClimbConstants.kClimbTolerance;
    }
}
//@@ harness
Climb climb = new Climb();
System.out.println(climb.atSetpoint(600.0, 597.0));
System.out.println(climb.atSetpoint(600.0, 590.0));
System.out.println(Constants.ClimbConstants.kClimbStowPos);
System.out.println(Constants.ClimbConstants.kClimbDeployPos);
//@@ expect
true
false
-225.0
600.0
//@@ hint
The class goes inside `Constants`, between its curly braces: `public static final class ClimbConstants { ... }`.
//@@ hint
Each constant looks like `public static final double kClimbTolerance = 5.0; // degrees`.
//@@ solution
public class Constants {
    public static final class ClimbConstants {
        public static final double kClimbTolerance = 5.0; // degrees
        public static final double kClimbStowPos = -225.0; // degrees
        public static final double kClimbDeployPos = 600.0; // degrees
    }
}

public class Climb {
    public boolean atSetpoint(double desiredDegrees, double currentDegrees) {
        return Math.abs(desiredDegrees - currentDegrees) < Constants.ClimbConstants.kClimbTolerance;
    }
}
//@@ explain
Now the tolerance has one home. If the climber needs to be more precise, you change one number, and everything that uses `kClimbTolerance` follows.
```

## Numbers you tune on the robot

Some numbers you can't know ahead of time. How hard should the climber's PID push? How high should the elevator go to score? You find out by trying a value, watching the robot, and adjusting. If every change meant editing code, building, and deploying (a minute or more each time), tuning would take all day.

So our tuning numbers aren't plain `double`s. They're `LoggedTunableNumber`s.

```java title="Constants.java"
public static final class ClimbConstants {
    public static final LoggedTunableNumber kClimbP = new LoggedTunableNumber("Climb P", 30.0);
    public static final LoggedTunableNumber kClimbI = new LoggedTunableNumber("Climb I", 0.0);
    public static final LoggedTunableNumber kClimbD = new LoggedTunableNumber("Climb D", 0.0);

    public static final LoggedTunableNumber kClimbStowPos =
        new LoggedTunableNumber("Climb Stow Angle", -225.0);
}
```

A `LoggedTunableNumber` has a name, which is how it shows up on the dashboard, and a __default__, the number in the code. While the robot runs in tuning mode, you can change it from the dashboard and the robot picks up the new value right away, no deploy needed.

Because it's an object and not a `double`, you read it with `.get()`:

```java
m_io.setDesiredAngle(Rotation2d.fromDegrees(ClimbConstants.kClimbStowPos.get()), 0.0);
```

Always call `.get()` where you __use__ the number, instead of saving it into a variable once. A saved copy never notices that you changed it.

Here is the idea in miniature. This pretend arm moves a fraction (`kP`) of the remaining distance toward 100 each loop. Run it, then change `kP` and run it again. Try 0.05, 0.5, and 1.5. A value that's too small is slow, and one that's too big overshoots and swings back and forth.

```playground
//@ title: Tune it
//@ prelude: wpilib
//@ goal: Change kP's default and press Run each time. Try 0.05, 0.5, 1.0 and 1.5. Which one gets to 100 fastest without overshooting?
//@ lines: 14
LoggedTunableNumber kP = new LoggedTunableNumber("Arm P", 0.2);

double position = 0.0;
double target = 100.0;

for (int loop = 1; loop <= 10; loop++) {
    // each loop, move kP of the way to the target
    position += kP.get() * (target - position);
    System.out.println("loop " + loop + ": " + Math.round(position));
}
```

!!! note "Tuning mode"
    Constants has a flag, `kTuningMode`. When it's `true`, a `LoggedTunableNumber` reads the dashboard. When it's `false`, it just returns the default from the code and nothing on the dashboard can change it. Once you find a good value on the dashboard, copy it into the code as the new default. The dashboard doesn't write your code for you.

### Only re-send when a number changes

There's one catch. A PID controller lives __inside the motor controller__, so after you change `kP`, the new value has to be sent to the motor over the CAN bus. You don't want to do that every 20 ms. It's traffic the bus doesn't need when nothing has changed.

`LoggedTunableNumber.ifChanged` solves it. You give it the numbers to watch and some code to run, and it runs the code only if one of the numbers is different from last time it checked (and once at the very start).

```java title="Climb.periodic(), simplified"
LoggedTunableNumber.ifChanged(
    hashCode(),
    () -> m_io.setPID(0, ClimbConstants.kClimbP.get(), ClimbConstants.kClimbI.get(), ClimbConstants.kClimbD.get()),
    ClimbConstants.kClimbP,
    ClimbConstants.kClimbI,
    ClimbConstants.kClimbD);
```

The first argument is an id, so that more than one object can watch the same number without disturbing each other. We pass `hashCode()`, a number that's different for each object. The second is the code to run, as a lambda. The rest are the numbers to watch.

Your turn. `periodic()` runs every loop. Make it re-send the PID to the motor only when a number changes.

```playground
//@ title: Re-send only on change
//@ prelude: wpilib
//@ goal: In periodic(), use LoggedTunableNumber.ifChanged so the PID is sent to the IO only when kClimbP, kClimbI or kClimbD changes. (Without it, it would be sent every loop.)
//@ lines: 38
//@ require: ifChanged\( | Use LoggedTunableNumber.ifChanged.
public class Constants {
    public static final class ClimbConstants {
        public static final LoggedTunableNumber kClimbP = new LoggedTunableNumber("Climb P", 30.0);
        public static final LoggedTunableNumber kClimbI = new LoggedTunableNumber("Climb I", 0.0);
        public static final LoggedTunableNumber kClimbD = new LoggedTunableNumber("Climb D", 0.0);
    }
}

public interface ClimbIO {
    public void setPID(double kP, double kI, double kD);
}

public class ClimbIOSim implements ClimbIO {
    @Override
    public void setPID(double kP, double kI, double kD) {
        System.out.println("PID " + kP + " " + kI + " " + kD);
    }
}

public class Climb {
    private final ClimbIO m_io;

    public Climb(ClimbIO io) {
        m_io = io;
    }

    public void periodic() {
        // Send the PID to m_io only when one of the three numbers changed:

    }
}
//@@ harness
Climb climb = new Climb(new ClimbIOSim());
climb.periodic();
climb.periodic();
climb.periodic();
Constants.ClimbConstants.kClimbP.set(35.0);
climb.periodic();
climb.periodic();
//@@ expect
PID 30.0 0.0 0.0
PID 35.0 0.0 0.0
//@@ hint
The call has three parts: an id (use `hashCode()`), a lambda that calls `m_io.setPID(...)`, and then the numbers to watch, separated by commas.
//@@ hint
`LoggedTunableNumber.ifChanged(hashCode(), () -> m_io.setPID(kP.get(), kI.get(), kD.get()), kP, kI, kD);` where each `kP`, `kI` and `kD` is written as `Constants.ClimbConstants.kClimbP` and so on.
//@@ solution
public class Constants {
    public static final class ClimbConstants {
        public static final LoggedTunableNumber kClimbP = new LoggedTunableNumber("Climb P", 30.0);
        public static final LoggedTunableNumber kClimbI = new LoggedTunableNumber("Climb I", 0.0);
        public static final LoggedTunableNumber kClimbD = new LoggedTunableNumber("Climb D", 0.0);
    }
}

public interface ClimbIO {
    public void setPID(double kP, double kI, double kD);
}

public class ClimbIOSim implements ClimbIO {
    @Override
    public void setPID(double kP, double kI, double kD) {
        System.out.println("PID " + kP + " " + kI + " " + kD);
    }
}

public class Climb {
    private final ClimbIO m_io;

    public Climb(ClimbIO io) {
        m_io = io;
    }

    public void periodic() {
        LoggedTunableNumber.ifChanged(
            hashCode(),
            () -> m_io.setPID(
                Constants.ClimbConstants.kClimbP.get(),
                Constants.ClimbConstants.kClimbI.get(),
                Constants.ClimbConstants.kClimbD.get()),
            Constants.ClimbConstants.kClimbP,
            Constants.ClimbConstants.kClimbI,
            Constants.ClimbConstants.kClimbD);
    }
}
//@@ explain
Five loops ran, but the PID was only sent twice: once at the start, and once after the number changed. The harness's `set(35.0)` plays the part of you typing a new value into the dashboard.
```

## Real and simulated numbers

A simulated motor isn't a real motor. It has no friction, no battery sag, and no gearbox slop, so the gains that work on the real climber might make the simulated one swing wildly. So `ClimbConstants` has a second set of numbers just for simulation.

```java title="ClimbConstants (shortened)"
// real: tunable from the dashboard
public static final LoggedTunableNumber kClimbP = new LoggedTunableNumber("Climb P", 30.0);

// sim constants
public static final double kSimGearing = 1.0;
public static final DCMotor kSimGearbox = DCMotor.getKrakenX60(1);
public static final double kSimClimbArmLengthMeters = 0.25;
public static final double kSimClimbP = 0.5;
public static final double kSimClimbD = 0.35;
```

The `Climb` subsystem picks between them using `RobotBase.isReal()`, which is `true` on a roboRIO and `false` on a laptop.

```java title="Climb.java"
if (RobotBase.isReal()) {
    m_io.setPID(m_currSlot, ClimbConstants.kClimbP.get(), ClimbConstants.kClimbI.get(), ClimbConstants.kClimbD.get());
} else {
    m_io.setPID(m_currSlot, ClimbConstants.kSimClimbP, ClimbConstants.kSimClimbI, ClimbConstants.kSimClimbD);
}
```

This is one of the few places where a subsystem checks whether it's real. Choosing which __IO class__ to use is still the job of `RobotContainer`, as you saw on that page. But the numbers that make the sim behave belong to the sim, so they're picked here.

## The other constants

Most of the file is nested classes for mechanisms, but a few are worth knowing about:

- __`Ports`__ holds every CAN id and the name of the CAN bus: `Ports.kIntakeRoller`, `Ports.kDriveCanivoreName`. When a wire is moved, the id changes in exactly one place.
- __`CurrentLimitConstants`__ holds how much current each motor is allowed to draw. These protect the motors and the battery.
- __Robot-wide settings__ sit at the very top of the file.

```java title="Constants.java, the top"
public static final boolean kTuningMode = true;

public static final Mode kRealMode = Mode.REAL;
public static final Mode kSimMode = Mode.SIM;
public static final Mode kCurrentMode = RobotBase.isReal() ? kRealMode : kSimMode;

// set to false to disable alerts
public static final boolean kUseAlerts = true && kCurrentMode != Mode.SIM;
```

`kCurrentMode` is the one `RobotContainer` switches on. `kUseAlerts` turns the "motor disconnected" dashboard alerts on and off. A flag here changes behavior across the whole robot, which is why it deserves a comment and a single home.

```quiz
@ title: Constants
? Why does each mechanism get its own nested class, like `ClimbConstants`?
- Java requires one class per mechanism
+ So each mechanism's numbers are grouped together and don't get mixed up with the others
- It makes the numbers faster to read
- So they can be changed while the robot runs
> Grouping makes `Constants.java` easy to scan, and `ClimbConstants.kClimbTolerance` reads like what it is.

? What does the `k` at the start of `kClimbTolerance` mean?
- It's short for "kilo"
+ It marks a constant, by WPILib convention
- It means the number is tunable
- It means the number is in kilometers
> It's a naming habit. It tells you at a glance that a name is a constant, not a variable.

? You have `LoggedTunableNumber kClimbP`. How do you get its value?
- `kClimbP`
+ `kClimbP.get()`
- `kClimbP.value`
- `(double) kClimbP`
> It's an object, so you ask it for its value. Call `.get()` each time you use it so you always see the latest value.

? Why use `LoggedTunableNumber.ifChanged` instead of sending the PID every loop?
- It's required by the motor controller
+ The PID only needs to reach the motor controller when a value has changed, and sending it every loop wastes CAN bus traffic
- It makes the PID more accurate
- It saves the numbers to the log
> It runs your code once at the start, and then only after a watched number changes.

? You find the perfect P value by typing it into the dashboard. What should you do next?
- Nothing. It's saved forever.
+ Copy it into the code as the new default, so it's the value next time the robot starts
- Delete the `LoggedTunableNumber`
- Restart the dashboard
> The dashboard value isn't part of your code. The default in `Constants.java` is what the robot starts with.

? Why does `ClimbConstants` have separate `kSimClimbP` and `kClimbP` values?
- The sim is faster
+ A simulated climber behaves differently from the real one, so it needs its own gains
- Because `kClimbP` can't be used in simulation
- To save memory
> The numbers that make a pretend motor behave well don't match the numbers for a real one.
```

---

## What's next

That's the whole structure of our robot code, from a button press all the way to a motor: a binding asks [RobotState](robotState.md) for an action, which sets each [subsystem](subsystems.md)'s state, which runs through an IO class using numbers from Constants. Now you know where to look in the real code. Open the `FRC-25` repository and trace a button from `RobotContainer` down to a `ClimbIOKraken`.
