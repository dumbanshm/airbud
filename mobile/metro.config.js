const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-notifications' index eagerly loads the native 'ExpoTopicSubscriptionModule' on Android,
// which Expo Go doesn't ship, so merely importing the package crashes the app there. We never
// use FCM topics, so point that one file at the package's own no-op version (the one it uses on
// iOS/web). Local reminders and Expo push are unaffected.
const topicStub = require.resolve('expo-notifications/build/TopicSubscriptionModule.js');
const resolveUpstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './TopicSubscriptionModule' &&
    context.originModulePath.includes(`${path.sep}expo-notifications${path.sep}`)
  ) {
    return { type: 'sourceFile', filePath: topicStub };
  }
  return (resolveUpstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
