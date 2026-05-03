import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/calculator_colors.dart';
import '../controller/calculator_controller.dart';
import '../widgets/calculator_button.dart';
import '../widgets/calculator_display.dart';

class CalculatorScreen extends StatelessWidget {
  const CalculatorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text(
          'Calculator',
          style: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w500,
            fontSize: 20,
          ),
        ),
        centerTitle: true,
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            children: [
              const Expanded(
                flex: 3,
                child: DisplaySection(),
              ),
              const SizedBox(height: 20),
              const Expanded(
                flex: 7,
                child: ButtonsSection(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DisplaySection extends StatelessWidget {
  const DisplaySection({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<CalculatorController>(
      builder: (context, controller, child) {
        return CalculatorDisplay(
          expression: controller.expression,
          result: controller.result,
        );
      },
    );
  }
}

class ButtonsSection extends StatelessWidget {
  const ButtonsSection({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Provider.of<CalculatorController>(context, listen: false);

    return Column(
      children: [
        // Top Row: C and Backspace (as requested) + Division
        Expanded(
          child: Row(
            children: [
              CalculatorButton(
                text: "C",
                onPressed: () => controller.onClear(),
                color: const Color(0xFFF5F5F5),
                textColor: CalculatorColors.primaryOrange,
                flex: 2,
              ),
              CalculatorButton(
                text: "⌫",
                onPressed: () => controller.onDelete(),
                color: const Color(0xFFF5F5F5),
                icon: const Icon(Icons.backspace_outlined, color: Colors.black87),
              ),
              CalculatorButton(
                text: "÷",
                onPressed: () => controller.onOperatorClick("÷"),
                color: CalculatorColors.primaryOrange,
                textColor: Colors.white,
              ),
            ],
          ),
        ),
        // Numbers 7, 8, 9 + Multi
        Expanded(
          child: Row(
            children: [
              CalculatorButton(text: "7", onPressed: () => controller.onNumberClick("7")),
              CalculatorButton(text: "8", onPressed: () => controller.onNumberClick("8")),
              CalculatorButton(text: "9", onPressed: () => controller.onNumberClick("9")),
              CalculatorButton(
                text: "×",
                onPressed: () => controller.onOperatorClick("×"),
                color: CalculatorColors.primaryOrange,
                textColor: Colors.white,
              ),
            ],
          ),
        ),
        // Numbers 4, 5, 6 + Minus
        Expanded(
          child: Row(
            children: [
              CalculatorButton(text: "4", onPressed: () => controller.onNumberClick("4")),
              CalculatorButton(text: "5", onPressed: () => controller.onNumberClick("5")),
              CalculatorButton(text: "6", onPressed: () => controller.onNumberClick("6")),
              CalculatorButton(
                text: "-",
                onPressed: () => controller.onOperatorClick("-"),
                color: CalculatorColors.primaryOrange,
                textColor: Colors.white,
              ),
            ],
          ),
        ),
        // Bottom Layout with Numbers 1, 2, 3, 0, . and Tall +
        Expanded(
          flex: 2,
          child: Row(
            children: [
              // 1, 2, 3, 0, ., =
              Expanded(
                flex: 3,
                child: Column(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          CalculatorButton(text: "1", onPressed: () => controller.onNumberClick("1")),
                          CalculatorButton(text: "2", onPressed: () => controller.onNumberClick("2")),
                          CalculatorButton(text: "3", onPressed: () => controller.onNumberClick("3")),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Row(
                        children: [
                          CalculatorButton(text: "0", onPressed: () => controller.onNumberClick("0"), flex: 1),
                          CalculatorButton(text: ".", onPressed: () => controller.onNumberClick(".")),
                          CalculatorButton(
                            text: "=",
                            onPressed: () => controller.onEqual(),
                            color: const Color(0xFFF5F5F5),
                            textColor: Colors.black87,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Tall Plus
              CalculatorButton(
                text: "+",
                onPressed: () => controller.onOperatorClick("+"),
                color: CalculatorColors.primaryOrange,
                textColor: Colors.white,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
