# Lesson 3: Classes, Objects, And Constructors

## Classes
A class in Java is like a blueprint for something you are trying to make. Imagine a blueprint for the car from the last lesson. You cannot physically drive the blueprint, but you can follow it to make the actual car. Similarly, classes themselves cannot do anything, but the class can be used to create an object that __can__ do things.

All methods and members reside in a class. Most Java projects start with a `Main` class, titled `Main.java`. This is where your _main_ code lives. For FRC, `Main.java` is taken care of by WPILib, so we won't ever have to touch it.

!!! warning "Important"
    Your class name __MUST__ match the name and capitalization of the file for it to run. It is something that is specific to Java and will cause an error if not followed.

```java title="Car.java"
public class Car {
   // Your methods and members will go here
}
```

Writing classes in Java is pretty simple. All it requires is the name of the class. The above example creates a class named `Car` in the `Car.java` file.

## Objects

An object is a real, usable thing created from a class, which is like its blueprint or recipe. The class describes what the object can have and can do, but by itself, it’s not something you can use yet.

When you create an object, it gets its own data (called members or fields), which stores information about that specific object. It also gets methods, which are the actions it can perform.

For example, for the Car class: it might say that every car has a color, speed, and fuelLevel, and that it can `drive()`, `brake()`, or `honk()`. When you make a car object, you now have a real car in your program: it might be red, going 50 mph, and able to honk whenever you call `myCar.honk()`.

### How to create an object

Creating an object, or making it exist, is called instantiation. Instantiation refers to the fact that you are creating a _unique_ instance of a class. Although many cars may use the same blueprint to build them, they may vary in tiny details, such as their color, top speed, or model. Each specific car is called an instance. The snippet below shows how to instantiate an object.

```java
class name = new class();
Car Acura = new Car("red", 50);
```
To instantiate and object, you must first specify its class. Just like how you must tell Java what type of member you are creating, you must tell it what type of object you are creating. 

Then, you provide a name for the object. Much like methods and members, the name of an object is anything that describes what the object is. 

Next, you must use the `new` operator to create a new car. 

Finally, you must specify the class once again so that Java knows what blueprint to use to build the object.

Additionally, if your class contains members, you can define it inside the parenthesis. This takes advantage of the object being a unique instance, meaning you can have multiple Acuras of a variety of colors. In this example, the car is red and starts at 50 mph.

### Using an object

Java is an object-oriented program language, which means that objects will take the members and methods of a class. This allows objects created by `instantiation` to perform actions of its assigned class. This is done using the __dot operator__, which is simply a `.` placed after the object name, which allows you to access the methods and members of the instance.


```playground
//@ title: Two cars from one blueprint
//@ goal: Run it. Then add a third car of your own, give it a color, and make it drive.
//@ lines: 22
public class Car {
    public String color;

    public Car(String color) {
        this.color = color;
    }

    public void drive() {
        System.out.println("The " + color + " car is driving");
    }
}

Car acura = new Car("red");
acura.drive();
System.out.println(acura.color);

Car toyota = new Car("orange");
toyota.drive();
System.out.println(toyota.color);
```

In the above example, we have instantiated two unique cars, an Acura and a Toyota. Since both the Acura and the Toyota are made from the `Car` class, they can both drive and stop. However, since they are objects unique of each other, they each have their own color, which is also accessed using the dot operator.

## Constructors

A constructor is a special method in Java that connects your object instantiation to the class blueprint. Think of it like this: The object instiation is a person looking to get a house built, the class is the blueprint for the house, and the constructor is the one who builds the house using the blueprint and adding in the buyer's preferences.

In the above example, the constructor would be in charge of making a red car that starts at 50 mph using a blueprint for a generic car.

```mermaid
graph LR
    A[Object Instantiation] -->|I want a red car| B[Constructor];
    D[Class] --> |Here's instructions for a car of color _x_|B;
    B --> C[Red Car Created];
```
### Writing a constructor
Constructors exist in the class. Highlighted below is an example constructor for the `Car` class.

```java title="Car.java" hl_lines="4-6"
public class Car {
    private String color;

    public Car(String color) {
        this.color = color;
    }
}
```
This constructor assigns the color specified during instantiation to the specific _instance_ of the car.

The word `this` means "the object being built right now". It separates the object's own `color` field (`this.color`) from the parameter that is also called `color`. Try the example below, and add a second parameter to the constructor.

```playground
//@ title: Add a field to the constructor
//@ goal: Run it. Then add a topSpeed field (an int), take it as a second constructor parameter, and print it too. Remember to change the call at the bottom.
//@ lines: 16
public class Car {
    private String color;

    public Car(String color) {
        this.color = color;
    }

    public void printInfo() {
        System.out.println("A " + color + " car");
    }
}

Car acura = new Car("red");
acura.printInfo();
```

## Combining Classes, Objects, and Constructors

=== "Main.java"
    ```java title="Main.java"
    public class Main {
        Car Acura = new Car("red");
    }
    ```
=== "Car.java"
    ```java title="Car.java" 
    public class Car {
        private String color;

        public Car(String color) {
            this.color = color;
        }

        public void drive() {
            // insert drive code
        }

        public void stop() {
            // insert stop code
        }
    }
    ```

Here's what happens when you run the code above:

1. A new object of type `Car` named `Acura` is attempting to be instantiated. It wants to be a red car. This happens in the `Main.java` file.
2. The `Car` constructor is called with the argument `"red"`. This happens in the `Car.java` file.
3. The constructor assigns the value `"red"` to the `color` field of the `Acura` object.
4. The `Acura` object is now fully instantiated and represents a red car. This car can use the methods outlined in the `Car.java` class, such as drive() and stop().

---

## Practice

#### Identify the parts

```playground
//@ title: Read the code
//@ mode: predict
//@ goal: What does this program print? (Hint: follow the constructor.)
public class Car {
    private String color;

    public Car(String color) {
        this.color = color;
    }

    public void honk() {
        System.out.println(color + " car says Beep!");
    }
}

Car acura = new Car("red");
acura.honk();
//@@ explain
`new Car("red")` runs the constructor, which stores `"red"` in this car's `color`. Then `honk()` uses that stored color.
```

Now match each piece of that code to its name.

```quiz
@ title: Class, object, or constructor?
? Which part is the **class**?
| public class Car { ... }
| public Car(String color) { ... }
| Car acura = new Car("red");
+ `public class Car { ... }`
- `public Car(String color) { ... }`
- `Car acura = new Car("red");`
> The class is the blueprint. It's the whole `Car` definition.

? Which part is the **constructor**?
| public class Car { ... }
| public Car(String color) { ... }
| Car acura = new Car("red");
- `public class Car { ... }`
+ `public Car(String color) { ... }`
- `Car acura = new Car("red");`
> A constructor has the same name as the class and no return type.

? Which part **instantiates an object**?
| public class Car { ... }
| public Car(String color) { ... }
| Car acura = new Car("red");
- `public class Car { ... }`
- `public Car(String color) { ... }`
+ `Car acura = new Car("red");`
> The `new` keyword builds a real Car from the blueprint, and `acura` is that object.

? How many objects exist after these two lines run? `Car a = new Car("red");` and `Car b = new Car("red");`
- 1, because they are both red
+ 2
- 0, because nothing was printed
> Every use of `new` creates a separate object, even when the contents are identical.
```

#### Challenge 1: Write a constructor

An FRC robot cares a lot about battery voltage. Finish this class by writing its constructor.

```playground
//@ title: Battery constructor
//@ goal: Write a constructor for Battery that takes a double called voltage and stores it in the voltage field.
//@ lines: 12
//@ require: public\s+Battery\s*\( | The constructor must be named Battery and be public.
//@ require: this\.voltage | Use this.voltage to set the field.
public class Battery {
    private double voltage;

    // Write the constructor here

    public double getVoltage() {
        return voltage;
    }

    public boolean isLow() {
        return voltage < 11.5;
    }
}
//@@ harness
Battery full = new Battery(12.6);
Battery weak = new Battery(10.9);
System.out.println(full.getVoltage());
System.out.println(full.isLow());
System.out.println(weak.getVoltage());
System.out.println(weak.isLow());
//@@ expect
12.6
false
10.9
true
//@@ hint
A constructor looks like a method with no return type, named exactly like the class.
//@@ hint
`public Battery(double voltage) { ... }`. Inside the braces, assign the parameter to the field.
//@@ solution
public class Battery {
    private double voltage;

    public Battery(double voltage) {
        this.voltage = voltage;
    }

    public double getVoltage() {
        return voltage;
    }

    public boolean isLow() {
        return voltage < 11.5;
    }
}
//@@ explain
Each Battery object remembers its own voltage, so the full battery and the weak battery behave differently from the same class.
```

#### Challenge 2: Make some objects

```playground
//@ title: Two cars
//@ goal: Below the class, create a red Car going 50 mph and a blue Car going 70 mph, then call describe() on each.
//@ lines: 16
//@ require: new\s+Car\s*\([^)]*\)[\s\S]*new\s+Car\s*\([^)]*\) | Use new to create two Car objects.
//@ require: describe\s*\(\s*\) | Call describe() on your cars.
public class Car {
    public String color;
    public int speed;

    public Car(String color, int speed) {
        this.color = color;
        this.speed = speed;
    }

    public void describe() {
        System.out.println("A " + color + " car going " + speed + " mph");
    }
}

// Create your cars below:

//@@ expect
A red car going 50 mph
A blue car going 70 mph
//@@ hint
`Car name = new Car("red", 50);` creates one. Give each car its own variable name.
//@@ hint
Use the dot operator to call a method: `name.describe();`
//@@ solution
public class Car {
    public String color;
    public int speed;

    public Car(String color, int speed) {
        this.color = color;
        this.speed = speed;
    }

    public void describe() {
        System.out.println("A " + color + " car going " + speed + " mph");
    }
}

Car acura = new Car("red", 50);
Car toyota = new Car("blue", 70);
acura.describe();
toyota.describe();
//@@ explain
One class, two objects. Each has its own color and speed, but they share the same methods. This pattern is the heart of how FRC subsystems work.
```
