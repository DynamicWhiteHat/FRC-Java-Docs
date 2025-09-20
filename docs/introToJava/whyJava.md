Java is a versatile programming language that is used for various sorts of applications, ranging from entriprise and mobile applications, IOT projects, and, in our case, for FRC programming. Java is one of the three officially supported programming lanuages for FRC: Java, Python, and C++. 

Many FRC teams choose Java for its ease-of-use compared to C++ and its versatility when compared to Python. Below is an example of the same code, using a joystick to control a motor, written in Java, C++, and Python.

=== "Java"
    ```java
    // Import WPILib classes
    import edu.wpi.first.wpilibj.Joystick;
    import edu.wpi.first.wpilibj.PWMVictorSPX;

    public class Robot extends TimedRobot {
        private final Joystick joystick = new Joystick(0);
        private final PWMVictorSPX motor = new PWMVictorSPX(0);

        @Override
        public void teleopPeriodic() {
            double speed = joystick.getY();   // Strongly typed: always a double
            motor.set(speed);                 // Easy, safe, no pointers
        }
    }
    ```
=== "C++"
    ```cpp
    #include <frc/Joystick.h>
    #include <frc/PWMVictorSPX.h>
    #include <frc/TimedRobot.h>

    class Robot : public frc::TimedRobot {
        frc::Joystick joystick{0};
        frc::PWMVictorSPX motor{0};

        void TeleopPeriodic() override {
            double speed = joystick.GetY();  // Works, but watch for precision issues
            motor.Set(speed);                // Must manage lifetimes carefully
        }
    };
    ```

=== "Python"
    ```py
    from wpilib import Joystick, PWMVictorSPX, TimedRobot

    class MyRobot(TimedRobot):
        def robotInit(self):
            self.joystick = Joystick(0)
            self.motor = PWMVictorSPX(0)

        def teleopPeriodic(self):
            speed = self.joystick.getY()  # Dynamically typed
            self.motor.set(speed)
    ```

In the example above, you can see that Java’s syntax is easier to read and understand compared to C++. For instance, creating objects in Java uses the simple `new` keyword, while C++ requires `::` and more complex type declarations, which can be confusing for beginners.

Python may look simpler than Java at first glance, but it isn’t fully supported by WPILib. This means that when you try more advanced robot programming tasks, Python can quickly become limiting.


!!! Note 
    This course will not cover the entire Java language, as it is vast and continually expanding. However, it will introduce you to the basics you need to write effective FRC robot code, allowing you to confidently control motors, read sensors, and structure your robot programs for both teleoperated and autonomous modes.

---

In summary, Java strikes a balance between readability, safety, and official FRC support. It allows new programmers to quickly understand and write robot code without getting bogged down by complex syntax or unsupported libraries. With this foundation, you’re now ready to dive into your first Java robot project and start controlling motors and sensors on your robot.
