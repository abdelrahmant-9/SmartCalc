import 'package:flutter_test/flutter_test.dart';
import 'package:smartcalc/features/calculator/logic/calculator_logic.dart';

void main() {
  final logic = CalculatorLogic();

  group('Final Edge Case Tests', () {
    test('Standard Operations', () {
      expect(logic.evaluateExpression("10+5-2×3÷1"), "9");
    });

    test('Division by zero', () {
      expect(logic.evaluateExpression("10÷0"), "Cannot divide by zero");
      expect(logic.evaluateExpression("10÷0.0"), "Cannot divide by zero");
    });

    test('Decimal sequences', () {
      expect(logic.evaluateExpression("0.1+0.2"), "0.3");
      expect(logic.evaluateExpression("1.1.1"), "Invalid format");
    });

    test('Large numbers', () {
      final result = logic.evaluateExpression("999999999×999999999");
      expect(result, isNot("Error"));
      expect(result, isNot("Invalid format"));
    });

    test('Incomplete expressions', () {
      expect(logic.evaluateExpression("5+"), "Incomplete expression");
      expect(logic.evaluateExpression("5-"), "Incomplete expression");
      expect(logic.evaluateExpression("5×"), "Incomplete expression");
      expect(logic.evaluateExpression("5÷"), "Incomplete expression");
    });

    test('Operator prefix', () {
      expect(logic.evaluateExpression("+5"), "Invalid format");
      expect(logic.evaluateExpression("×5"), "Invalid format");
      expect(logic.evaluateExpression("÷5"), "Invalid format");
      // -5 is valid but math_expressions might need context, let's check
    });
  });
}
