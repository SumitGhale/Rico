import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { type Conversation, fetchConversations } from '@/services/chatService';

const SIDEBAR_WIDTH = Dimensions.get('window').width * 0.78;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation?: (id: string) => void;
}

export function ConversationSidebar({ isOpen, onClose, onSelectConversation }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    fetchConversations()
      .then(setConversations)
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setIsVisible(false);
      });
    }
  }, [isOpen, translateX, backdropOpacity]);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            opacity: backdropOpacity,
          }}
        />
      </TouchableWithoutFeedback>

      {/* Sidebar panel */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: SIDEBAR_WIDTH,
          backgroundColor: '#fbfbfe',
          shadowColor: '#000',
          shadowOffset: { width: 4, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 20,
          transform: [{ translateX }],
        }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pb-6 pt-16">
          <Text className="text-4xl font-bold tracking-tight text-gray-900">Rico</Text>
        </View>

        {/* Recents label */}
        <View className="px-6 pb-3">
          <Text className="text-sm font-medium tracking-wide text-gray-400">Recents</Text>
        </View>

        {/* Conversation list */}
        <ScrollView className="flex-1">
          {isLoading ? (
            <ActivityIndicator size="small" color="#6b7280" className="mt-8" />
          ) : (
            conversations.map((conv) => (
              <TouchableOpacity
                key={conv.id}
                className={`px-6 rounded-xl py-3  mx-2 ${selectedConversationId === conv.id ? 'bg-stone-200' : 'active:bg-stone-200'}`}
                onPress={() => {
                  setSelectedConversationId(conv.id);
                  onSelectConversation?.(conv.id);
                  onClose();
                }}
                activeOpacity={0.6}
              >
                <Text className="text-lg text-gray-800" numberOfLines={1}>
                  {conv.title ?? 'New conversation'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* New chat button */}
        <View className="border-t border-gray-200 px-6 pb-12 pt-4">
          <TouchableOpacity
            className="flex-row items-center justify-center gap-2 rounded-full bg-primary py-4"
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#2A2A2A"  />
            <Text className="text-base font-bold text-text">New chat</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}
