# Lesson 1 - Methods and Members

## Setting up for code
Before you start coding, its always best to set up an environment where you can keep track of your code. Create a folder where you can store your code. Personally, I have a Java folder in my Documents.

## Methods and Members
Objects in Java are made up of two main parts: members and methods. Members hold information about the object, while methods are the actions the object can do.

### Members
Members, also called attributes or variables, are characteristics of an object that you can define and change later. For example, if you were making a car, you might want to define its color, top speed, and miles per gallon. Keep in mind that these values are allowed to change, so something like fuel level, which changes over time, would still be a member.

<div style="display: flex; align-items: center; gap: 15px;" markdown>

<div style=""markdown>
When defining a member in Java, you must follow proper __syntax__. The correct way to define a member is shown below.
</div>

<div markdown>
!!! note "Syntax"
    Syntax is a set of rules you must follow for Java to be able to understand you. Much like how English requires proper grammar, Java requires proper syntax to work. In Java, most statements (like variable definitions or method calls) must end with a semicolon (;).
</div>

</div>

```java title="Syntax for defining a member"
type   name    = value;

int wheelCount = 4;
```
#### Data types

Whenever you create a member, you must first assign it a _type_. _Type_ is a reference to the data type of the variable. The following are data types used in FRC Java: `int`, `String`, `double`, and `boolean`.

- `int`: This stands for integer. An integer is any whole number that we would want to use. For the car example, we might use `int` for the number of wheels, since we can't have a fraction of a wheel.
- `String`: A string is any combination of characters. This is used almost exclusively for logging errors in FRC Java. If we didn't know why the car wasn't driving, we might want to print out "not driving" at times to test it, which would use a `String`.
- `double`: This is used for decimal values. For the car example, we might use `double` for the car’s speed, since a car can travel at 55.5 miles per hour or 32.7 km/h, not just whole numbers.
- `boolean`: This data type can only be either `true` or `false` (lowercase only). It is used in conditionals, which is ued to make decisions in code. For example, we might say, "if the car in on, start moving." The "if the car is on" part could be represented by a `boolean`.

#### Name
The name of a member can be anything you like. Although this is the case, it is best give a member a name that is representative of what it is. For example, `fuelLevel` would be a much better name for the car's fuel level than `thing1`. Names must be one word to follow proper syntax, otherwise Java would throw an error.

!!! note "Camel Case"
    Did you notice that the capitalization was funky in the code above? This is called camel case, which is when we capitalize the first letter of every word in a variable, save for the first word. For example, "constant speed" would be written as `constantSpeed`.

#### Value
The value of the member must match the type it is assigned. For example, you cannot assign a value of `true` to an `int` object, as `int` expects a whole number. As long as it falls within the expected type, the value can be as large as you need it to be.

#### Using members

The value of members can be used and updated throughout your code, which is what makes them so powerful. Once you've defined the `type` for the member, you can update it without having to redefine its type. In the below example, `message` is created as a String, and its value gets changed.


```playground
//@ title: Change a member
//@ goal: Press Run. Then change the second message to anything you like and run it again.
String message = "hello world";
System.out.println(message);
message = "Java is cool";
System.out.println(message);
```

??? question "What does `System.out.println` do?"
    It prints whatever you give it to the console, then moves to a new line. That's how you "see" what your code is doing, and it's the first debugging tool you'll reach for in FRC too, where the output appears in the Driver Station console.

#### Try all four types

Here is one of each type. Press __Run__, then break it on purpose: change `4` to `4.5`, or put `"four"` where the `4` is. Reading Java's error messages is a skill, and the best way to learn it is to cause some.

```playground
//@ title: The four types
//@ goal: Run it, then try to break it. What does Java say when you put a decimal in an int?
int wheelCount = 4;
double speed = 55.5;
String name = "Acura";
boolean isOn = true;

System.out.println(name + " has " + wheelCount + " wheels");
System.out.println("Speed: " + speed);
System.out.println("Running: " + isOn);
```

### Methods

Methods, also known as functions, are actions that an object can do. In the case of the car example, methods could be `drive()`, `turnOnLights()`, and `slowDown()`.

The proper syntax to define a method is shown below:

```java title="Syntax for defining a method"
accessModifier returnType name(parameters) {
    // code goes here
}

public void slowDown() {
    // code goes here
}
```

#### Access modifier
The first part of defining a method is the access modifier. This tells Java who can access, or run, the method. There are three types of access modifiers: `public`, `private`, and `protected`. `Public` means that anyone can access it from anywhere, including from outside the file the method is created in. `Private` means that access is limited to a certain level, such as only the current class. `Protected`, which isn't used as much in FRC, is more accessible than `Private`, but is still limited in access, typically only to the current class and its subclasses.

#### Return type
The second part of a method is its return type. The return type tells Java if you plan to return, or output, some value to whoever called the function. This is done using the `return` statement. For example, when you speed up the car, you don't get any information back, thus it wouldn't require a return statement. However, checking the navigation would require back some map data for you to be able to tell where you are, which would require a return statement.

```java title="Example use of return"
public int calculateRemainingMiles() {
    int milesRemaining = "insert cool math here";
    return milesRemaining;
}
```

In the above example, you can see how the number of miles remaining is being returned to whoever called the method. In this case, since milesRemaining is an int, the return type is set to `int`.

Here is a method you can run. It takes in a number and gives one back. Notice that the method does nothing until something __calls__ it.

```playground
//@ title: A method that returns a value
//@ goal: Run it. Then change the numbers in the two calls at the bottom.
public int milesRemaining(int tankSize, int milesPerGallon) {
    return tankSize * milesPerGallon;
}

System.out.println(milesRemaining(10, 25));
System.out.println(milesRemaining(15, 30));
```

#### Name
Much like members, the name of a method can be anything you want. It is common practice to name it something related to what the method does.

#### Parameters
Parameters are things that the method can take in to manipulate or make decisions. Not all methods need parameters. The following example shows a parameter `vehicleType` being used to determine how many wheels a car has.

```playground
//@ title: A method with a parameter
//@ goal: Run it, then call the method with "truck" instead of "sedan".
public void determineVehicleWheels(String vehicleType) {
    if (vehicleType.equals("sedan")) {
        System.out.println("This has 4 wheels");
    }
    else if (vehicleType.equals("truck")) {
        System.out.println("This has 8 wheels");
    }
}

determineVehicleWheels("sedan");
```

!!! warning "Compare Strings with `.equals`"
    To check whether two `String`s hold the same text, use `.equals("text")`, not `==`. The `==` operator asks whether two Strings are the very same object in memory, which can give you a wrong answer even when the words match. You'll see `.equals` used from here on.

#### Curly brackets/braces
The `{}` is the final key component of a method. This is what will serve as the boundary or fence of the code for your method. The code you write for your method to do something must lie withint the opening, `{`, and closing ,`}`, brackets.

---


### Practice

Time to write some code of your own. Each challenge checks your work when you press __Check my code__. If you get stuck, the hints reveal one at a time.

#### Members or methods?

Each of these is part of code that creates an animal. Decide whether it is a member or a method.

```quiz
@ title: Members or methods?
? `int numLegs;`
- Member
- Method
+ Member
> It holds information about the animal, and has no parentheses or body.

? `public void eat() {}`
+ Method
- Member
> The parentheses and `{}` body make it an action the animal can do.

? `private int returnFriendCount() {}`
+ Method
- Member
> `private` is its access modifier and `int` is its return type, but the parentheses and body show it's a method.

? `String name;`
+ Member
- Method
> A `String` holds text, which is information about the animal.

? `double hoursOld;`
+ Member
- Method
> It stores a decimal number describing the animal.
```

#### Challenge 1: Create members

```playground
//@ title: Create four members
//@ goal: Create these four members, using exactly these names and the right type for each: wheelCount (4), speed (55.5), name ("Acura"), and isOn (true).
//@ require: int\s+wheelCount | Declare wheelCount as an int.
//@ require: double\s+speed | Declare speed as a double.
//@ require: String\s+name | Declare name as a String.
//@ require: boolean\s+isOn | Declare isOn as a boolean.
// Write your four members here:

//@@ harness
System.out.println(wheelCount + " " + speed + " " + name + " " + isOn);
//@@ expect
4 55.5 Acura true
//@@ hint
Each member follows the pattern `type name = value;`
//@@ hint
The type for 55.5 is `double`, and the type for text is `String`. Text goes inside double quotes.
//@@ solution
int wheelCount = 4;
double speed = 55.5;
String name = "Acura";
boolean isOn = true;
//@@ explain
That's the pattern for every member you'll ever write: `type name = value;`
```

#### Challenge 2: Write a method

```playground
//@ title: Write a method
//@ goal: Write a method named doubleIt that takes an int called number and returns the number times 2.
//@ require: int\s+doubleIt\s*\( | The method should be named doubleIt and return an int.
//@ require: return | Your method needs to return a value.
// Write your method here:

//@@ harness
System.out.println(doubleIt(4));
System.out.println(doubleIt(10));
System.out.println(doubleIt(-3));
//@@ expect
8
20
-6
//@@ hint
The header looks like `public int doubleIt(int number)`.
//@@ hint
Inside the braces, use `return` followed by the math.
//@@ solution
public int doubleIt(int number) {
    return number * 2;
}
//@@ explain
The method takes a value in through its parameter and sends a new value back out with `return`.
```
