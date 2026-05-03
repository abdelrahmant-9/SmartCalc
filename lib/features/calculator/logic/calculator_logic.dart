import 'package:math_expressions/math_expressions.dart';

class CalculatorLogic {
  String evaluateExpression(String expression) {
    if (expression.isEmpty) return "";

    try {
      // Basic validation for trailing operators or incomplete expressions
      final lastChar = expression[expression.length - 1];
      if (['+', '-', '×', '÷', '.'].contains(lastChar)) {
        return "Incomplete expression";
      }

      // Check for leading operators (except minus)
      final firstChar = expression[0];
      if (['+', '×', '÷'].contains(firstChar)) {
        return "Invalid format";
      }

      // Check for multiple operators in a row
      if (RegExp(r'[\+\-\×\÷]{2,}').hasMatch(expression)) {
        return "Invalid format";
      }

      // Pre-process expression for math_expressions
      String finalExpression = expression.replaceAll('×', '*').replaceAll('÷', '/');

      // Check for division by zero
      if (finalExpression.contains('/0')) {
        if (RegExp(r'/0($|[^.0-9])').hasMatch(finalExpression)) {
          return "Cannot divide by zero";
        }
      }

      Parser p = Parser();
      Expression exp = p.parse(finalExpression);
      ContextModel cm = ContextModel();
      double eval = exp.evaluate(EvaluationType.REAL, cm);

      if (eval.isInfinite) {
        return "Cannot divide by zero";
      }
      if (eval.isNaN) {
        return "Invalid calculation";
      }

      // Format result: Remove .0 if it's an integer
      if (eval == eval.toInt() && eval.abs() < 1e15) {
        return eval.toInt().toString();
      }

      String result = eval.toString();
      // Handle scientific notation or very long decimals
      if (result.contains('e') || result.length > 15) {
        result = eval.toStringAsPrecision(10);
      }
      
      if (result.contains('.')) {
        result = result.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
      }

      return result;
    } catch (e) {
      return "Invalid format";
    }
  }
}
