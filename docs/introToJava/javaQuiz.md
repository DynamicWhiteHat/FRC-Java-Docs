# Quiz

Check what stuck from the three Java lessons. Questions are shuffled every time you start, and the quiz keeps your best score on this device, so you can come back and beat it. When you finish, you get a list of the ones you missed.

Some questions have more than one right answer. Those will tell you to pick all that apply, and you press __Check answer__ when you are ready.

## Lesson 1: Members and methods

```quiz
@ title: Lesson 1 quiz
? Which data type would you use to store the number of wheels on a car?
- double
- String
+ int
- boolean
> A wheel count is a whole number, so `int` fits. `double` is for decimals.

? Which line correctly creates a member?
- `int wheelCount == 4;`
- `wheelCount int = 4;`
+ `int wheelCount = 4;`
- `int wheel count = 4;`
> The pattern is `type name = value;`. Names can't contain spaces, and `==` compares rather than assigns.

? What is wrong with this line?
| int speed = 55.5;
- Nothing, it is fine
+ A decimal can't be stored in an `int`
- `speed` is a reserved word
- It is missing the word `public`
> `55.5` has a decimal part, so the type should be `double`. Java reports this as a "lossy conversion".

? Which of these are valid camelCase names? (Pick all that apply.)
+ fuelLevel
+ topSpeed
- FuelLevel
- top_speed
- top speed
> Camel case starts lowercase and capitalizes each new word with no spaces or underscores.

? In `public int calculateMiles() { ... }`, what is `int`?
- The access modifier
+ The return type
- The name
- A parameter
> `public` is the access modifier, `int` is the return type, and `calculateMiles` is the name.

? What does `void` mean as a return type?
- The method returns zero
+ The method does not return anything
- The method can't be called
- The method is private
> Use `void` when a method just does something and doesn't send a value back.

? Which statement about `private` is true?
- Anyone can call the method from anywhere
+ Access is limited, for example to the current class
- It can only be used on members
- It makes the method run faster
> `public` opens something up to everyone. `private` restricts it.
```

## Lesson 2: Operators, conditionals and loops

```quiz
@ title: Lesson 2 quiz
? What does `10 % 3` evaluate to?
- 3
- 0
+ 1
- 3.33
> `%` gives the remainder. 3 goes into 10 three times with 1 left over.

? What does this print?
| System.out.println(9 / 2);
- 4.5
+ 4
- 5
- 4.0
> Dividing two `int`s drops the decimal part.

? What does this print?
| System.out.println(9 / 2.0);
+ 4.5
- 4
- 5
- 4.0
> One side is a `double`, so the answer keeps its decimal.

? Which operator __compares__ two values for equality?
- `=`
+ `==`
- `!=`
- `=>`
> A single `=` assigns, and a double `==` compares.

? What does this print?
| int x = 7;
| if (x > 5) {
|     System.out.println("big");
| } else if (x > 3) {
|     System.out.println("medium");
| } else {
|     System.out.println("small");
| }
+ big
- medium
- small
- big and medium
> Java stops at the first true branch. `7 > 5` is true, so `else if` is never checked.

? How many times does this loop run?
| for (int i = 0; i < 10; i++) { }
- 9
+ 10
- 11
- Forever
> `i` takes the values 0 through 9, which is 10 times.

? What does this print?
| for (int i = 10; i >= 0; i -= 5) {
|     System.out.print(i + " ");
| }
- 10 5
+ 10 5 0
- 10 5 0 -5
- 0 5 10
> It starts at 10 and subtracts 5 each time, stopping once `i >= 0` is false.

? Which is the best way to check whether a `String` named `color` holds "red"?
- `color = "red"`
- `color == "red"`
+ `color.equals("red")`
- `if color is "red"`
> `.equals` compares the text itself. `==` can give a wrong answer for Strings.

? Which of these will cause an infinite loop?
- `for (int i = 0; i < 3; i++) { }`
+ `for (int i = 0; i < 3; i--) { }`
- `for (int i = 3; i > 0; i--) { }`
> In the middle one `i` keeps getting smaller, so `i < 3` is always true.
```

## Lesson 3: Classes, objects and constructors

```quiz
@ title: Lesson 3 quiz
? What is the relationship between a class and an object?
- They are the same thing
+ A class is the blueprint, an object is a real thing built from it
- An object is the blueprint, a class is a real thing built from it
- Objects can only be made without a class
> Many objects, each with its own data, can be built from one class.

? The file contains `public class Car { }`. What must the file be named?
- car.java
- MyCar.java
+ Car.java
- Main.java
> A public class's name must match the file name exactly, including capitalization.

? What does the `new` keyword do?
- Declares a new variable type
+ Creates a new object from a class
- Defines a new method
- Imports a class
> `new Car("red")` builds a fresh `Car` object and calls its constructor.

? What is special about a constructor? (Pick all that apply.)
+ It has the same name as the class
+ It has no return type
+ It runs when you use `new`
- It must be `void`
- It can only be called once per program
> A constructor looks like a method without a return type, and `new` calls it each time you make an object.

? In this constructor, what does `this.color` refer to?
| public Car(String color) {
|     this.color = color;
| }
- The parameter named `color`
+ The `color` field of the object being built
- A different class
- The color of the computer screen
> `this` points at the object itself, so `this.color` is the field and plain `color` is the parameter.

? What does this print?
| Car a = new Car("red");
| Car b = new Car("blue");
| System.out.println(a.color);
+ red
- blue
- red blue
- Nothing, it's an error
> Each object keeps its own copy of the fields. `a` was built with "red".

? Which line makes the car drive, assuming `acura` is a `Car`?
- `acura->drive();`
- `drive(acura);`
+ `acura.drive();`
- `Car.acura.drive;`
> The dot operator accesses an object's methods and members.
```

## Putting it together

These ones mix everything. Read each carefully, and use the Java lessons if you need to.

```quiz
@ title: Mixed review
? What does this print?
| public class Counter {
|     private int count;
|     public Counter(int start) { this.count = start; }
|     public int next() { count = count + 1; return count; }
| }
|
| Counter c = new Counter(5);
| c.next();
| System.out.println(c.next());
- 5
- 6
+ 7
- 8
> The counter starts at 5. The first `next()` makes it 6, and the second makes it 7, which is what prints.

? What does this print?
| int total = 0;
| for (int i = 1; i <= 4; i++) {
|     if (i % 2 == 0) {
|         total += i;
|     }
| }
| System.out.println(total);
- 10
- 4
+ 6
- 2
> Only the even values 2 and 4 get added, giving 6.

? Which of these is a member and which is a method? Pick the one that is a method.
- `private double speed;`
- `String name;`
+ `public double getSpeed() { return speed; }`
- `boolean isOn = false;`
> Methods have parentheses and a body. The others just store information.
```

## Ready for more?

If you scored well, you have the Java you need to start reading real robot code. Head to [FRC Nuances](../frcSpecifics/frcProgramming.md) next. If a topic felt shaky, go back to its lesson and try the practice challenges again.
