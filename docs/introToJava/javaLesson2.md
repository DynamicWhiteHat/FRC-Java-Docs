# Lesson 2: Comparision Operators, Conditionals And For Loops

## Operators

### Comparision operators

Operators in Java are typically grouped into categories depending on their function. One of these is the comparision operators, which are used to compare two values. This is especially important for conditionals and for loops, as it defines when they run or how long to run for. Below is a list of operators which are used commonly.

- `==`: Equal to (5 == 5 → true)

- `!=`: Not equal to (5 != 3 → true)

- `>`: Greater than (7 > 4 → true)

- `<`: Less than (2 < 6 → true)

- `>=`: Greater than or equal to (7 >= 7 → true)

- `<=`: Less than or equal to (3 <= 5 → true)

Comparision operators will output a boolean value, either true or false, depending on the values provided. You can use the output for setting members, using conditionals, and more. Below is an example of using comparision operators.


```playground
//@ title: Comparison operators
//@ goal: Run it, then change the numbers and see which lines print true or false.
boolean isGreater = 5 > 7;
System.out.println("5 > 7 is " + isGreater);
System.out.println("5 == 5 is " + (5 == 5));
System.out.println("7 != 3 is " + (7 != 3));
System.out.println("3 <= 3 is " + (3 <= 3));

if (5 == 5) {
    System.out.println("This is true");
}
```

!!! note "`==` vs `=`"
    A single `=` __assigns__ a value (`int x = 5;`). A double `==` __compares__ two values (`x == 5`). Mixing them up is one of the most common beginner mistakes.

### Arithmetic operators

Arithmetic operators are used for basic mathematical operations, such as adding or subtracting two values. Here is a list of common arithmetic operators:


- `+`: Addition
- `-`: Subtraction
- `*`: Multiplication
- `/`: Division
- `%`: Modulus (remainder after division)

Using arithmetic operators is simple. Just place them between the two values you want to use it on.

Before you run this, work out what it prints. Type your prediction in the box, then press __Check my prediction__.

```playground
//@ title: Predict the output
//@ mode: predict
//@ goal: What will these two lines print? Put each answer on its own line.
int a = 5;
int b = 6;
System.out.println(a + b);
System.out.println(a % b);
//@@ explain
`5 + 6` is 11. For `5 % 6`, 6 doesn't fit into 5 at all, so the whole 5 is left over as the remainder.
```

#### Integer division

When you divide two `int`s, Java throws away the decimal part. This catches out almost everyone at least once, and it matters in FRC code, where you'll often divide to turn encoder counts into distances.

```playground
//@ title: Integer division
//@ mode: predict
//@ goal: Predict all three lines. Careful with the first two!
System.out.println(7 / 2);
System.out.println(7 / 2.0);
System.out.println(1 / 2);
//@@ explain
Two `int`s divide as an `int`, so `7 / 2` is 3 and `1 / 2` is 0. If either side is a `double`, you get a decimal answer: `7 / 2.0` is 3.5.
```


## Conditionals

A conditional is a way to make choices based on the current situation. The program asks itself _is this true?_, and if so do this, otherwise, do something else. The diagram below shows a visual representation of a conditional.

```mermaid
graph LR
    A[Is this true?] --> |Yes|B[Do This];
    A[Is this true?] --> |No|C[Do This Instead];
```

Java has three types of conditional statements, `if`, `else if`, and `else`.

### If statements

An `if` statement is the first part of any conditional. It initiates the check by asking if something is equal to some value. The syntax for an `if` statement is shown below.

```java
if (condition) {
    // do this
}
```

Run it below. Then change `color` to `"blue"` and run it again. Nothing prints, because the condition is false and there is no `else`.

```playground
//@ title: Your first if statement
//@ goal: Change color to "blue". What happens?
String color = "red";

if (color.equals("red")) {
    System.out.println("The car is red");
}
```

The condition can be anything that you want Java to evaluate. It could be some basic math operations, such as `5>6`, which would evaluate to false. It could also use variables (members) from last lesson, such as `if(boolean)`, which will always evaluate to either true or false, since those are the only two values a `boolean` can store. The above example checks if the color of the vehicle is red, and __if so__, print out "The car is red".

### Else statements

An `else` statement is the next conditional in the flow of a conditional chain. This serves as the alternative action if the first `if` statement evaluates to false.

```java
if (condition) {
    // do this
}

else {
    // do this
}

```

```playground
//@ title: if and else
//@ goal: Run it with each color: "red", then something else.
String color = "green";

if (color.equals("red")) {
    System.out.println("The car is red");
}
else {
    System.out.println("The car is not red");
}
```

In the example above, the first if statement checks whether the car is red. If the car is not red, that condition evaluates to false, and the program moves to the `else` block. The `else` block doesn’t have its own condition, it simply runs whenever the if statement fails, acting like a “catch-all” for everything that wasn’t true.

### Else if statements

What if you wanted to check if the car was blue? Although you could technically put multiple `if` statements one-after-another, Java has an efficient way to check different conditions, called an `else if` block. Check out the example below to see the difference.

=== "Bad example"
    ```java
    if (vehicle.color.equals("red")) {
        System.out.println("The car is red");
    }

    if (vehicle.color.equals("blue")) {
        System.out.println("The car is blue");
    }

    if (vehicle.color.equals("orange")) {
        System.out.println("The car is orange");
    }

    else {
        System.out.println("The car is not red");
    }
    ```
=== "Good example"
    ```java
    if (vehicle.color.equals("red")) {
        System.out.println("The car is red");
    }

    else if (vehicle.color.equals("blue")) {
        System.out.println("The car is blue");
    }

    else if (vehicle.color.equals("orange")) {
        System.out.println("The car is orange");
    }

    else {
        System.out.println("The car is not red");
    }
    ```

Notice how only the middle two `if` statements were changed to `else if`.
This small change makes the code much more efficient:

- With `else if`, Java stops checking as soon as one condition is true. For example, if the car is blue, Java checks red, then checks blue, and then exits the chain immediately.

- With separate `if` statements, Java would still check all the other conditions, even if one was already true. That means if the car is blue, it would still check orange, which is unnecessary.

By using `else if`, you make your code both faster and easier to read.

```playground
//@ title: An else if chain
//@ goal: Try "red", "blue", "orange" and "purple". Which branch runs for each?
String color = "blue";

if (color.equals("red")) {
    System.out.println("The car is red");
}
else if (color.equals("blue")) {
    System.out.println("The car is blue");
}
else if (color.equals("orange")) {
    System.out.println("The car is orange");
}
else {
    System.out.println("The car is some other color");
}
```

### Conditionals with booleans

Conditionals can also be used with booleans directly, since they can only be either true or false. The snippet below provides an example.

```playground
//@ title: Conditionals with booleans
//@ goal: Run it, then set carIsOn to false.
boolean carIsOn = true;

if (carIsOn) {
    System.out.println("Ready to drive");
}
else {
    System.out.println("Turn car on to drive");
}
```
You wouldn't need to say `if (carIsOn==true)`, since Java knows that since its a boolean value, it can only be true or false, so it handles the checking for you.


!!! note "Usage of `else` and `else if`"
    You won't always need an `else if` or even an `else` condition. This depends on your code and if you want to do something if the first `if` condition is false.

## For Loops

A `for` loop is a way to repeat a block of code a set number of times. Think of it like this: imagine you’re told to do 10 push-ups. Instead of someone saying “Do a push-up, do a push-up, do a push-up…” ten times, they just say “Do 10 push-ups.” A `for` loop works the same way — it repeats your instructions automatically until the count is done.

### Syntax

The proper way to write a for loop uses a variable, typically called `i`, to keep track of how many times the loop has run. An example is shown below.

```playground
//@ title: Do 10 push-ups
//@ goal: Run it. Then change the 10 to a different number, and try starting i at 1 instead of 0.
for (int i = 0; i < 10; i++) {
    System.out.println("Push-up number " + (i + 1));
}
```

You can break down the inside, `int i=0;i<10;i++`, into three main parts: Initialization, condition, and update/increment.

#### Initialization

Just like when you create a member, Java needs a variable inside the loop to keep track of how many times it has run. This follows the same pattern you’ve already seen: `type name = value`. In the example above, the type is `int`, the name is `i`, and the starting value is `0`. That means the counter variable `i` begins at 0, and Java will use it to control how many times the loop repeats. You may also begin the counter `i` above `0`, which is typically used when counting down.

#### Condition

This part of the `for` loop statement — the condition — controls how many times your code will repeat. The condition is checked before each iteration, and the loop only continues if it evaluates to `true`. The condition is usually written in the form: `name<value`. Here, name is the variable from the initialization, and value sets the stopping point.
!!! note "Use of <"
    At first glance, a condition like `i < 10` might seem like the loop will only run 9 times. However, since the counter `i` starts at `0`, the loop runs for `i = 0, 1, 2, ..., 9`, which is 10 iterations total. This “zero-based counting” is standard practice in Java (and most programming languages).

Examples of conditions you can use:

- Less than (i < 10) → loop runs while i is less than 10.

- Less than or equal to (i <= 10) → loop runs while i is less than or equal to 10 (so it runs 11 times if starting from 0).

- Greater than (i > 0) → often used when counting down.

- Greater than or equal to (i >= 0) → loop continues until i drops below 0.

- Equality check (i == 5) → less common, but possible if you only want to run when i hits a specific value.

#### Update

The update (also called the increment) is the last portion of a `for` loop. It controls how the loop variable changes after each iteration. In most cases, such as the example, this is written as `i++`, which means “increase `i` by 1.”

The update is essential — without it, the condition might never be met, causing an infinite loop.

Examples of updates:

- `i++`: increases by 1 (most common).

- `i--`: decreases by 1 (useful for counting down).

- `i += 2`: increases by 2 (counts even numbers if starting at 0).

- `i *= 2`: doubles the value each time.

The update doesn’t always have to be an increment; it can be any expression that changes the loop variable. This flexibility allows for loops to handle many patterns, like skipping numbers, looping backward, or growing exponentially.

### Combining initialization, condition, and update

The example below shows how you can use the three components of a `for` loop to count down from 10, skipping every other number.

```playground
//@ title: Counting down by twos
//@ goal: Run it. Then make it count down by threes, or count up from 0 to 20 by fives.
for (int i = 10; i >= 0; i -= 2) {
    System.out.print(i + " ");
}
```

Here, the `i` variable starts at 10 and we decrease it by 2 every time the loop runs. This continues while `i` is greater than or equal to 0.

---

## Practice

#### Predict the output

Look at the code below. What will it print? Work it out on paper first, one value of `i` at a time, then type your answer and press __Check my prediction__.

```playground
//@ title: Even, odd, or big?
//@ mode: predict
//@ goal: Type exactly what this prints, one line per line of output.
for (int i = 0; i <= 5; i++) {
    if (i % 2 == 0) {
        System.out.println(i + " is even");
    } else if (i > 3) {
        System.out.println(i + " is greater than 3 and odd");
    } else {
        System.out.println(i + " is odd");
    }
}
//@@ explain
Even numbers hit the first branch. For the odd ones, only 5 is greater than 3, so it gets the second branch.
```

#### Challenge 1: Limit a motor speed

Motors in FRC accept a speed from -1.0 to 1.0. Anything beyond that is invalid, so robot code often __clamps__ a value into the allowed range. You can do that with the conditionals you just learned.

```playground
//@ title: Clamp a speed
//@ goal: Finish the method so it returns 1.0 if speed is above 1.0, returns -1.0 if speed is below -1.0, and otherwise returns speed unchanged.
//@ require: if | Use an if statement.
public double clamp(double speed) {
    // your code here
    return speed;
}
//@@ harness
System.out.println(clamp(0.5));
System.out.println(clamp(2.3));
System.out.println(clamp(-5.0));
System.out.println(clamp(-0.25));
//@@ expect
0.5
1.0
-1.0
-0.25
//@@ hint
You need two checks: one for speed too high, and one for speed too low.
//@@ hint
`if (speed > 1.0) { return 1.0; }` stops the method right there and sends back 1.0. Write the matching check for the low end.
//@@ solution
public double clamp(double speed) {
    if (speed > 1.0) {
        return 1.0;
    } else if (speed < -1.0) {
        return -1.0;
    }
    return speed;
}
//@@ explain
This exact idea is in WPILib as `MathUtil.clamp`. You'll meet it again when you start driving motors.
```

#### Challenge 2: Count down

```playground
//@ title: Liftoff
//@ goal: Use a for loop to print 5, 4, 3, 2, 1 on separate lines, then print Liftoff!
//@ require: for\s*\( | Use a for loop.
// Write your loop here:

//@@ expect
5
4
3
2
1
Liftoff!
//@@ hint
Start i at 5, keep going while i is at least 1, and use i-- to count down.
//@@ solution
for (int i = 5; i >= 1; i--) {
    System.out.println(i);
}
System.out.println("Liftoff!");
//@@ explain
Counting down just means starting high, checking with `>=`, and decreasing with `i--`.
```
