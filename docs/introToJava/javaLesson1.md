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


=== "Code"
    ```java
    String message = "hello world";
    System.out.println(message);
    message = "Java is cool";
    System.out.println(message);
    ```
=== "Output"
    ```java
    hello world
    Java is cool
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

#### Name
Much like members, the name of a method can be anything you want. It is common practice to name it something related to what the method does.

#### Parameters
Parameters are things that the method can take in to manipulate or make decisions. Not all methods need parameters. The following example shows a parameter `vehicleType` being used to determine how many wheels a car has.

=== "Code"
    ```java
    public void determineVehicleWheels(String vehicleType) {
        if (vehicleType == "sedan") {
            System.out.println("This has 4 wheels");
        }
        else if (vehicleType == "truck") {
            System.out.println("This has 8 wheels");
        }
    }

    determineVehicleWheels("sedan");

    ```
=== "Output" 
    ```java
    This has 4 wheels
    ```

#### Curly brackets/braces
The `{}` is the final key component of a method. This is what will serve as the boundary or fence of the code for your method. The code you write for your method to do something must lie withint the opening, `{`, and closing ,`}`, brackets.

---


### Practice 
See if you can correctly identify the methods and members for the following, which is part of code creating an animal.
=== "Identify"
    ```java
    int numLegs
    public void eat() {}
    private int returnFriendCount() {}
    String name
    double hoursOld
    ``` 
=== "Answers"
    ```java
    int numLegs // member
    public void eat() {} // method
    private int returnFriendCount() {} // method
    String name // member
    double hoursOld // member
    ``` 

