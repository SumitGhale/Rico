import { StyleSheet, Text, TextInput } from "react-native";

/**
 * Makes Poppins the app-wide default font.
 *
 * React Native has no global font: every <Text>/<TextInput> uses the system
 * typeface unless a `fontFamily` is set. Loading a single family also breaks
 * weights — RN won't pick `Poppins_700Bold` just because `fontWeight: 700` is
 * set; the family name must match the loaded font file.
 *
 * This patches the render of Text/TextInput once so each element gets the
 * Poppins family that matches its resolved `fontWeight` (from NativeWind
 * classes like `font-bold` or inline `fontWeight` styles). Elements that set an
 * explicit `fontFamily` (e.g. the serif greeting) are left untouched.
 */
function familyForWeight(weight?: string | number): string {
  const w = String(weight ?? "400");
  if (w === "500") return "Poppins_500Medium";
  if (w === "600") return "Poppins_600SemiBold";
  if (w === "700" || w === "800" || w === "900" || w === "bold") {
    return "Poppins_700Bold";
  }
  return "Poppins_400Regular";
}

function patch(Component: any) {
  const original = Component.render;
  if (!original) return;

  Component.render = function (props: any, ref: any) {
    const flat = StyleSheet.flatten(props.style) || {};

    // Respect any explicitly chosen font (serif, etc.)
    if (flat.fontFamily) {
      return original.call(this, props, ref);
    }

    const style = [
      props.style,
      { fontFamily: familyForWeight(flat.fontWeight), fontWeight: undefined },
    ];
    return original.call(this, { ...props, style }, ref);
  };
}

patch(Text);
patch(TextInput);
