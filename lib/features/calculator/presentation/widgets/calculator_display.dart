import 'package:flutter/material.dart';
import '../../../../core/constants/calculator_colors.dart';

class CalculatorDisplay extends StatelessWidget {
  final String expression;
  final String result;

  const CalculatorDisplay({
    super.key,
    required this.expression,
    required this.result,
  });

  @override
  Widget build(BuildContext context) {
    final bool isError = [
      "Cannot divide by zero",
      "Invalid format",
      "Incomplete expression",
      "Invalid calculation"
    ].contains(result);

    return LayoutBuilder(
      builder: (context, constraints) {
        return Container(
          padding: const EdgeInsets.all(16),
          width: double.infinity,
          decoration: BoxDecoration(
            color: CalculatorColors.background.withOpacity(0.5),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Colors.black.withOpacity(0.05), // Fixed border color
              width: 1.5,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // Expression View
              Flexible(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  reverse: true,
                  child: Text(
                    expression.isEmpty ? " " : expression,
                    style: TextStyle(
                      fontSize: constraints.maxHeight * 0.15,
                      color: const Color(0xFFAAAAAA),
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              // Result/Error View
              Flexible(
                flex: 2,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    result.isEmpty ? (expression.isEmpty ? "0" : "") : result,
                    style: TextStyle(
                      fontSize: isError ? 100 : 200,
                      fontWeight: isError ? FontWeight.w400 : FontWeight.w500,
                      color: isError ? Colors.redAccent : CalculatorColors.textDark,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
