// Run with:  node tools/test-minijava.js
// Tests for the in-browser Java interpreter (docs/javascripts/minijava.js).
const MiniJava = require('../docs/javascripts/minijava.js');
try { MiniJava.registerPrelude('wpilib', require('fs').readFileSync(__dirname + '/../docs/javascripts/preludes/wpilib.java', 'utf8')); } catch (e) { /* prelude optional for core tests */ }

let pass = 0, fail = 0;
const failures = [];

function t(name, src, expected, opts) {
  const r = MiniJava.run(src, opts || {});
  let got = r.output;
  if (r.error) got += (got && !got.endsWith('\n') ? '\n' : '') + `<<${r.error.kind}${r.error.line ? '@' + r.error.line : ''}: ${r.error.message.split('\n')[0]}>>`;
  const exp = expected;
  if (got === exp) pass++;
  else { fail++; failures.push(`✗ ${name}\n   expected: ${JSON.stringify(exp)}\n   got:      ${JSON.stringify(got)}`); }
}

/* ---------- basics ---------- */
t('hello', 'System.out.println("Hello");', 'Hello\n');
t('full class', 'public class Main { public static void main(String[] args) { System.out.println("hi " + 2); } }', 'hi 2\n');
t('int division', 'System.out.println(7 / 2); System.out.println(7 % 2); System.out.println(-7 / 2);', '3\n1\n-3\n');
t('double division', 'System.out.println(7 / 2.0); System.out.println(1.0 / 3);', '3.5\n0.3333333333333333\n');
t('double format', 'System.out.println(5.0); System.out.println(100.0 / 4); System.out.println(1e10); System.out.println(0.0001); System.out.println(12345678.9);', '5.0\n25.0\n1.0E10\n1.0E-4\n1.23456789E7\n');
t('concat', 'int a = 1; double b = 2.5; System.out.println("x" + a + b + true + \'c\' + null);', 'x12.5truecnull\n');
t('char math', "char c = 'a'; c++; System.out.println(c); System.out.println(c + 1); System.out.println((char)(c + 1));", 'b\n99\nc\n');
t('casts', 'double d = 9.99; int i = (int) d; System.out.println(i); System.out.println((double) 5 / 2); System.out.println((int) -2.7);', '9\n2.5\n-2\n');
t('compound', 'int x = 10; x += 5; x -= 3; x *= 2; x /= 5; x %= 3; System.out.println(x); int y = 5; y += 2.7; System.out.println(y);', '1\n7\n');
t('inc dec', 'int i = 5; System.out.println(i++); System.out.println(++i); System.out.println(i--); System.out.println(--i);', '5\n7\n7\n5\n');
t('boolean ops', 'boolean a = true, b = false; System.out.println(a && b); System.out.println(a || b); System.out.println(!a); System.out.println(5 > 3 && 2 != 2);', 'false\ntrue\nfalse\nfalse\n');
t('ternary', 'int x = 5; String s = x > 3 ? "big" : "small"; System.out.println(s);', 'big\n');
t('if else chain', 'int x = 7; if (x < 5) { System.out.println("a"); } else if (x < 10) { System.out.println("b"); } else { System.out.println("c"); }', 'b\n');
t('for loop', 'for (int i = 0; i < 3; i++) { System.out.print(i + " "); } System.out.println();', '0 1 2 \n');
t('for countdown', 'for (int i = 10; i >= 0; i -= 2) { System.out.print(i + " "); }', '10 8 6 4 2 0 ');
t('while', 'int n = 0; while (n < 3) { n++; } System.out.println(n);', '3\n');
t('do while', 'int n = 10; do { n++; } while (n < 5); System.out.println(n);', '11\n');
t('break continue', 'for (int i = 0; i < 10; i++) { if (i == 2) continue; if (i == 5) break; System.out.print(i); }', '0134');
t('lesson 2 practice', `for (int i = 0; i <= 5; i++) {
    if (i % 2 == 0) { System.out.println(i + " is even"); }
    else if (i > 3) { System.out.println(i + " is greater than 3 and odd"); }
    else { System.out.println(i + " is odd"); }
}`, '0 is even\n1 is odd\n2 is even\n3 is odd\n4 is even\n5 is greater than 3 and odd\n');
t('nested loops', 'for (int i = 1; i <= 3; i++) { for (int j = 1; j <= 3; j++) { System.out.print(i * j + " "); } System.out.println(); }', '1 2 3 \n2 4 6 \n3 6 9 \n');

/* ---------- methods ---------- */
t('loose method', `static int square(int x) { return x * x; }
System.out.println(square(5));`, '25\n');
t('method in class', `public class Main {
  public static int add(int a, int b) { return a + b; }
  public static void main(String[] args) { System.out.println(add(2, 3)); }
}`, '5\n');
t('overload', `public class Main {
  static String f(int x) { return "int"; }
  static String f(double x) { return "double"; }
  static String f(String x) { return "String"; }
  public static void main(String[] a) { System.out.println(f(1)); System.out.println(f(1.5)); System.out.println(f("s")); }
}`, 'int\ndouble\nString\n');
t('int to double param', `static double half(double x) { return x / 2; }
System.out.println(half(5));`, '2.5\n');
t('recursion', `static int fact(int n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
System.out.println(fact(10));`, '3628800\n');
t('fib', `static int fib(int n) { return n < 2 ? n : fib(n-1) + fib(n-2); }
System.out.println(fib(15));`, '610\n');
t('void return', `static void greet(String n) { if (n == null) { return; } System.out.println("hi " + n); }
greet("bob"); greet(null);`, 'hi bob\n');
t('varargs', `static int sum(int... xs) { int t = 0; for (int x : xs) { t += x; } return t; }
System.out.println(sum()); System.out.println(sum(1,2,3));`, '0\n6\n');

/* ---------- classes ---------- */
const car = `
public class Car {
  private String color;
  private int speed;
  public Car(String color, int speed) { this.color = color; this.speed = speed; }
  public Car(String color) { this(color, 50); }
  public void speedUp() { speed += 10; }
  public int getSpeed() { return speed; }
  public String getColor() { return color; }
  @Override public String toString() { return color + " car at " + speed; }
}
`;
t('class basics', car + `
public class Main { public static void main(String[] args) {
  Car a = new Car("red"); a.speedUp(); System.out.println(a); System.out.println(a.getSpeed());
  Car b = new Car("blue", 20); System.out.println(b.getColor()); } }`, 'red car at 60\n60\nblue\n');
t('private access error', car + `Car c = new Car("x"); System.out.println(c.color);`, '<<compile@12: color has private access in Car>>');
t('static members', `
class Counter { static int count = 0; int id; Counter() { count++; id = count; } }
new Counter(); new Counter(); Counter c = new Counter();
System.out.println(Counter.count + " " + c.id);`, '3 3\n');
t('inheritance', `
class Animal { String name; Animal(String n) { name = n; } String sound() { return "..."; } String describe() { return name + " says " + sound(); } }
class Dog extends Animal { Dog(String n) { super(n); } @Override String sound() { return "Woof"; } }
class Cat extends Animal { Cat(String n) { super(n); } String sound() { return "Meow"; } }
Animal[] zoo = { new Dog("Rex"), new Cat("Tom"), new Animal("Generic") };
for (Animal a : zoo) { System.out.println(a.describe()); }`, 'Rex says Woof\nTom says Meow\nGeneric says ...\n');
t('super method', `
class A { String hi() { return "A"; } }
class B extends A { String hi() { return super.hi() + "B"; } }
System.out.println(new B().hi());`, 'AB\n');
t('interface', `
interface Shape { double area(); default String label() { return "shape:" + area(); } }
class Sq implements Shape { double s; Sq(double s) { this.s = s; } public double area() { return s * s; } }
Shape x = new Sq(3); System.out.println(x.label());`, 'shape:9.0\n');
t('abstract', `
abstract class Base { abstract int v(); int twice() { return v() * 2; } }
class Impl extends Base { int v() { return 21; } }
System.out.println(new Impl().twice());`, '42\n');
t('abstract instantiate error', `abstract class Base {} new Base();`, '<<compile@1: Base is abstract; cannot be instantiated>>');
t('static call from instance error', `
public class Main { int x = 3; void foo() {} public static void main(String[] args) { foo(); } }`, '<<compile@2: non-static method foo() cannot be referenced from a static context>>');
t('toString default format', `class P {} String s = new P().toString(); System.out.println(s.startsWith("P@"));`, 'true\n');
t('enum', `
enum State { IDLE, RUNNING, DONE }
State s = State.RUNNING;
System.out.println(s); System.out.println(s.ordinal()); System.out.println(State.values().length);
switch (s) { case IDLE: System.out.println("i"); break; case RUNNING: System.out.println("r"); break; default: System.out.println("d"); }`, 'RUNNING\n1\n3\nr\n');
t('enum with fields', `
enum Pos { HOME(0.0), HIGH(90.5); private final double deg; Pos(double d) { deg = d; } double getDeg() { return deg; } }
System.out.println(Pos.HIGH.getDeg() + " " + Pos.valueOf("HOME"));`, '90.5 HOME\n');
t('nested static class constants', `
public class Constants {
  public static final class OperatorConstants { public static final int kDriverControllerPort = 0; public static final double kDeadband = 0.1; }
}
System.out.println(Constants.OperatorConstants.kDriverControllerPort + " " + Constants.OperatorConstants.kDeadband);`, '0 0.1\n');
t('field defaults', `class T { int a; double b; boolean c; String d; char e; } T t = new T(); System.out.println(t.a + " " + t.b + " " + t.c + " " + t.d);`, '0 0.0 false null\n');
t('init blocks order', `class T { int x = 5; { x += 1; } T() { x *= 2; } } System.out.println(new T().x);`, '12\n');
t('this chaining & final', `class T { final int x; T(int x) { this.x = x; } } T t = new T(4); t.x = 9;`, '<<compile@1: cannot assign a value to final variable x>>');

/* ---------- arrays & collections ---------- */
t('arrays', `int[] a = {3, 1, 2}; System.out.println(a.length); a[1] = 10; int s = 0; for (int x : a) s += x; System.out.println(s);
int[] b = new int[3]; System.out.println(b[2]); String[] n = new String[2]; System.out.println(n[0]);
int[][] g = new int[2][3]; g[1][2] = 7; System.out.println(g[1][2] + " " + g.length + " " + g[0].length);
System.out.println(Arrays.toString(a));`, '3\n15\n0\nnull\n7 2 3\n[3, 10, 2]\n');
t('array oob', `int[] a = new int[3]; a[3] = 1;`, '<<exception@1: java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3>>');
t('arraylist', `ArrayList<Integer> l = new ArrayList<>(); l.add(5); l.add(7); l.add(1); System.out.println(l); System.out.println(l.size() + " " + l.get(1)); l.remove(0); System.out.println(l); System.out.println(l.contains(7));
ArrayList<String> s = new ArrayList<String>(); s.add("a"); for (String x : s) System.out.println(x);`, '[5, 7, 1]\n3 7\n[7, 1]\ntrue\na\n');
t('list type', `List<String> l = new ArrayList<>(); l.add("x"); System.out.println(l.get(0));`, 'x\n');
t('hashmap', `HashMap<String,Integer> m = new HashMap<>(); m.put("a", 1); m.put("b", 2); m.put("a", 5); System.out.println(m.get("a") + " " + m.size() + " " + m.containsKey("z") + " " + m.getOrDefault("z", 0)); System.out.println(m);`, '5 2 false 0\n{a=5, b=2}\n');
t('string methods', `String s = "Hello, World"; System.out.println(s.length() + " " + s.charAt(4) + " " + s.substring(7) + " " + s.toUpperCase() + " " + s.indexOf("World") + " " + s.contains("lo,") + " " + s.equals("Hello, World"));`, '12 o World HELLO, WORLD 7 true true\n');
t('string builder', `StringBuilder sb = new StringBuilder(); for (int i = 0; i < 3; i++) sb.append(i).append(","); System.out.println(sb.toString());`, '0,1,2,\n');
t('Math', `System.out.println(Math.abs(-5) + " " + Math.abs(-2.5) + " " + Math.max(3, 7) + " " + Math.pow(2, 10) + " " + Math.sqrt(16) + " " + Math.round(2.5) + " " + Math.floor(2.7) + " " + Math.max(2, 3.5));`, '5 2.5 7 1024.0 4.0 3 2.0 3.5\n');
t('printf', `System.out.printf("%d items, %.2f avg, %s%n", 3, 2.0 / 3, "ok"); System.out.println(String.format("%5d|%-5s|%05.1f", 42, "ab", 3.14159));`, '3 items, 0.67 avg, ok\n   42|ab   |003.1\n');
t('Integer parse', `System.out.println(Integer.parseInt("42") + 1); System.out.println(Double.parseDouble("2.5") * 2);`, '43\n5.0\n');
t('number format exception', `Integer.parseInt("abc");`, '<<exception@1: java.lang.NumberFormatException: For input string: "abc">>');

/* ---------- lambdas ---------- */
t('lambda runnable', `Runnable r = () -> System.out.println("run!"); r.run(); r.run();`, 'run!\nrun!\n');
t('lambda supplier/consumer', `
java.util.function.Supplier<Integer> s = () -> 42;
System.out.println(s.get());
java.util.function.Function<Integer,Integer> f = x -> x * 2;
System.out.println(f.apply(21));
java.util.function.BiFunction<Integer,Integer,Integer> add = (a, b) -> { return a + b; };
System.out.println(add.apply(2, 3));`, '42\n42\n5\n');
t('lambda captures', `int[] count = {0}; Runnable r = () -> count[0]++; r.run(); r.run(); System.out.println(count[0]);`, '2\n');
t('method ref', `
class T { void hi() { System.out.println("hi from T"); } Runnable getR() { return this::hi; } static void sh(String s) { System.out.println("static " + s); } }
T t = new T(); t.getR().run();
java.util.function.Consumer<String> c = T::sh; c.accept("x");
Runnable p = System.out::println; p.run();`, 'hi from T\nstatic x\n\n');
t('lambda in field', `
class Btn { Runnable action; void set(Runnable r) { action = r; } void press() { if (action != null) action.run(); } }
Btn b = new Btn(); b.press(); b.set(() -> System.out.println("pressed")); b.press();`, 'pressed\n');

/* ---------- exceptions ---------- */
t('div by zero', `int x = 5; System.out.println(x / 0);`, '<<exception@1: java.lang.ArithmeticException: / by zero>>');
t('npe', `String s = null; System.out.println(s.length());`, '<<exception@1: java.lang.NullPointerException: Cannot invoke "String.length()" because "s" is null>>');
t('try catch', `try { int x = 1 / 0; } catch (ArithmeticException e) { System.out.println("caught " + e.getMessage()); } finally { System.out.println("done"); }`, 'caught / by zero\ndone\n');
t('custom exception', `
class MyEx extends RuntimeException { MyEx(String m) { super(m); } }
try { throw new MyEx("boom"); } catch (MyEx e) { System.out.println(e.getMessage() + " " + e); }
throw new IllegalStateException("bad");`, 'boom MyEx: boom\n<<exception@4: java.lang.IllegalStateException: bad>>');
t('stack overflow', `static int f(int n) { return f(n + 1); } f(0);`, '<<exception@1: java.lang.StackOverflowError>>');
t('infinite loop limit', `while (true) { }`, '<<limit@1: Your program ran for too long. Is there an infinite loop?>>', { maxSteps: 50000 });

/* ---------- compile-ish errors ---------- */
t('missing semicolon', `int x = 5\nSystem.out.println(x);`, '<<compile@1: \';\' expected>>');
t('undefined variable', `System.out.println("a"); System.out.println(y);`, '<<compile@1: cannot find symbol>>');
t('lossy conversion', `int x = 5.5;`, '<<compile@1: incompatible types: possible lossy conversion from double to int>>');
t('string to int', `int x = "hello";`, '<<compile@1: incompatible types: String cannot be converted to int>>');
t('int to string', `String s = 5;`, '<<compile@1: incompatible types: int cannot be converted to String>>');
t('already defined', `int x = 1;\nint x = 2;`, '<<compile@2: variable x is already defined in this scope>>'.replace('this scope', 'method main(String[])'));
t('missing return', `static int f(int x) { if (x > 0) { return 1; } }\nSystem.out.println(f(-1));`, '<<compile@1: missing return statement>>');
t('uninitialized', `int x; System.out.println(x);`, '<<compile@1: variable x might not have been initialized>>');
t('unclosed string', `System.out.println("hi);`, '<<compile@1: unclosed string literal>>');
t('missing brace', `public class Main { public static void main(String[] a) { System.out.println(1);`, '<<compile@1: reached end of file while parsing>>');
t('wrong arg count', `static int add(int a, int b) { return a + b; } add(1);`, '<<compile@1: method add in class $Main cannot be applied to given types;>>');
t('boolean cond', `int x = 1; if (x) { }`, '<<compile@1: incompatible types: int cannot be converted to boolean>>');
t('compile error clears output', `System.out.println("shown?"); int x = "s";`, '<<compile@1: incompatible types: String cannot be converted to int>>');
t('no semicolon after call', `System.out.println("a")\nSystem.out.println("b");`, '<<compile@1: \';\' expected>>');

/* ---------- check harness ---------- */
{
  const r = MiniJava.run('static int sq(int x) { return x * x; }', { harness: 'Check.equal("sq(3)", sq(3), 9); Check.equal("sq(4)", sq(4), 15);' });
  const ok = r.checks.length === 2 && r.checks[0].pass && !r.checks[1].pass && r.checks[1].actual === '16';
  if (ok) pass++; else { fail++; failures.push('✗ Check harness: ' + JSON.stringify(r)); }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log('\n' + failures.join('\n')); process.exit(1); }
