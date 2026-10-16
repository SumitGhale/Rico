import BottomSheet, {
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { OnEventResponse } from "@howljs/calendar-kit/lib/typescript/types";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Host, ColorPicker } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

interface CreateEventBottomSheetProps {
  idx: number;
  onEventCreated: (eventTitle: string, startDate: Date, endDate: Date, color: string) => void;
  setIndex: (index: number) => void;
  eventTitle: string;
  event?: OnEventResponse | null; // Optional prop for the selected event
}

export function CreateEventBottomSheet({
  idx,
  onEventCreated,
  setIndex,
  eventTitle,
  event,
}: CreateEventBottomSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const [title, setTitle] = React.useState(eventTitle);
  const [startDate, setStartDate] = React.useState(new Date());
  const [endDate, setEndDate] = React.useState(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // default to 1 hour later
  const [color, setColor] = useState("#FF6347");

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      if (event.start?.dateTime) {
        setStartDate(new Date(event.start.dateTime));
      }
      if (event.end?.dateTime) {
        setEndDate(new Date(event.end.dateTime));
      }
    } else {
      // Reset for a fresh event
      setTitle("");
      setStartDate(new Date());
      setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    }
  }, [event]);

  useEffect(() => {
    if (idx === -1) {
      sheetRef.current?.close();
    } else {
      sheetRef.current?.snapToIndex(idx);
    }
  }, [idx]);

  // 2. Handle saving: dismiss keyboard, animate sheet closed, call callback
  const handleSave = () => {
    Keyboard.dismiss();
    sheetRef.current?.close();
    onEventCreated(title, startDate, endDate,color);
    setTitle(""); // reset input
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={idx}
      snapPoints={["60%"]}
      enablePanDownToClose
      onClose={() => {
        setIndex(-1); // Reset index when the sheet is closed
      }}
    >
      <BottomSheetView className="flex-1 px-6 pt-5 pb-8">
        {/* Title */}
        <Text className="mb-5 text-xl font-bold text-gray-900">New Event</Text>
        {/* Event title */}
        <View className="mb-5 rounded-2xl bg-gray-100 px-4 py-4">
          <BottomSheetTextInput
            placeholder="Event title"
            value={title}
            placeholderTextColor="#9ca3af"
            className="text-base text-gray-900"
            onChangeText={setTitle}
          />
        </View>

        {/* Start date and time */}
        <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-gray-100 px-4 py-4">
          <Text className="text-sm font-medium text-gray-500">Starts</Text>

          <DateTimePicker
            value={startDate}
            mode="datetime"
            display="compact"
            onChange={(event, selectedDate) => {
              const currentDate = selectedDate || new Date();
              setStartDate(currentDate);
            }}
          />
        </View>

        {/* Finish date and time */}
        <View className="mb-6 flex-row items-center justify-between rounded-2xl bg-gray-100 px-4 py-4">
          <Text className="text-sm font-medium text-gray-500">Ends</Text>

          <DateTimePicker
            value={endDate}
            mode="datetime"
            display="compact"
            onChange={(event, selectedDate) => {
              const currentDate = selectedDate || new Date();
              setEndDate(currentDate);
            }}
          />
        </View>

        {/* Color Picker */}
        <View className="mb-6 flex-row items-center justify-between rounded-2xl bg-gray-100 px-4">
          <Text className="text-sm font-medium text-gray-500">Event Color</Text>

          <Host matchContents>
            <ColorPicker
              label=""
              selection={color}
              onSelectionChange={setColor}
              modifiers={[frame({ height: 60, width: 60 })]}
            />
          </Host>
        </View>
        {/* Save button */}
        <TouchableOpacity
          className="items-center justify-center rounded-2xl bg-blue-600 py-4"
          onPress={handleSave}
        >
          <Text className="text-base font-bold text-white">Save Event</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
}
