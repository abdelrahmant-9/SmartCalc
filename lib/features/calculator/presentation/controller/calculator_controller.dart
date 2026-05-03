import 'package:flutter/material.dart';
import '../../logic/calculator_logic.dart';

class CalculatorController extends ChangeNotifier {
  final CalculatorLogic _logic = CalculatorLogic();

  String _expression = "";
  String _result = "";

  String get expression => _expression;
  String get result => _result;

  // List of possible error messages to identify error state
  final List<String> _errorMessages = [
    "Cannot divide by zero",
    "Invalid format",
    "Incomplete expression",
    "Invalid calculation",
    "Error"
  ];

  bool get _hasError => _errorMessages.contains(_result);

  void onNumberClick(String value) {
    if (_hasError || (_expression.isEmpty && _result.isNotEmpty)) {
      onClear();
    }
    
    if (value == ".") {
      final parts = _expression.split(RegExp(r'[\+\-\×\÷]'));
      if (parts.isNotEmpty && parts.last.contains(".")) {
        return;
      }
      if (_expression.isEmpty || _isOperator(_expression[_expression.length - 1])) {
        _expression += "0";
      }
    }

    _expression += value;
    _autoEvaluate();
    notifyListeners();
  }

  void onOperatorClick(String operator) {
    if (_hasError) {
      onClear();
      return;
    }

    if (_expression.isEmpty) {
      if (operator == "-") {
        _expression = "-";
        notifyListeners();
      }
      return;
    }

    if (_result.isNotEmpty) {
      _expression = _result;
      _result = "";
    }

    final lastChar = _expression[_expression.length - 1];

    if (_isOperator(lastChar)) {
      _expression = _expression.substring(0, _expression.length - 1) + operator;
    } else if (lastChar == ".") {
      _expression = _expression.substring(0, _expression.length - 1) + operator;
    } else {
      _expression += operator;
    }

    notifyListeners();
  }

  void onEqual() {
    if (_expression.isEmpty || _expression == "-") return;

    final evaluation = _logic.evaluateExpression(_expression);
    if (_errorMessages.contains(evaluation)) {
      _result = evaluation;
    } else {
      _expression = evaluation;
      _result = "";
    }
    notifyListeners();
  }

  void onClear() {
    _expression = "";
    _result = "";
    notifyListeners();
  }

  void onDelete() {
    if (_hasError) {
      onClear();
      return;
    }

    if (_expression.isNotEmpty) {
      _expression = _expression.substring(0, _expression.length - 1);
      _autoEvaluate();
      notifyListeners();
    }
  }

  void _autoEvaluate() {
    if (_expression.isEmpty || _expression == "-") {
      _result = "";
      return;
    }

    final lastChar = _expression[_expression.length - 1];
    if (!_isOperator(lastChar) && lastChar != ".") {
      final evaluation = _logic.evaluateExpression(_expression);
      // Don't show specific error messages during auto-evaluate to keep UI clean
      _result = _errorMessages.contains(evaluation) ? "" : evaluation;
    }
  }

  bool _isOperator(String char) {
    return ['+', '-', '×', '÷'].contains(char);
  }
}
