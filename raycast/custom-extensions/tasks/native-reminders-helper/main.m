#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

#define MSG_ID(obj, selectorName) ((id (*)(id, SEL))objc_msgSend)(obj, NSSelectorFromString(selectorName))
#define MSG_BOOL(obj, selectorName) ((BOOL (*)(id, SEL))objc_msgSend)(obj, NSSelectorFromString(selectorName))
#define MSG_INTEGER(obj, selectorName) ((NSInteger (*)(id, SEL))objc_msgSend)(obj, NSSelectorFromString(selectorName))

static NSString * const ReminderKitPath = @"/System/Library/PrivateFrameworks/ReminderKit.framework/ReminderKit";

static NSString *JSONString(id value) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

static NSDictionary *JSONArgument(int index, int argc, const char *argv[]) {
  if (argc <= index) {
    @throw [NSException exceptionWithName:@"MissingArgument" reason:@"Missing JSON payload" userInfo:nil];
  }

  NSData *data = [[NSString stringWithUTF8String:argv[index]] dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
  if (![object isKindOfClass:[NSDictionary class]]) {
    @throw [NSException exceptionWithName:@"InvalidArgument" reason:error.localizedDescription ?: @"JSON payload must be an object" userInfo:nil];
  }
  return object;
}

static void PrintJSON(id value) {
  printf("%s\n", [JSONString(value) UTF8String]);
}

static NSString *StringValue(id value) {
  if (!value || value == [NSNull null]) return @"";
  if ([value isKindOfClass:[NSString class]]) return value;
  if ([value respondsToSelector:@selector(stringValue)]) return [value stringValue];
  return [value description] ?: @"";
}

static NSString *NullableString(id value) {
  NSString *string = StringValue(value);
  return string.length ? string : nil;
}

static NSString *UUIDStringForObjectID(id objectID) {
  if (!objectID) return @"";
  id uuid = MSG_ID(objectID, @"uuid");
  return StringValue(uuid);
}

static NSString *ISODate(NSDate *date) {
  if (!date) return @"";
  static NSDateFormatter *formatter;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    formatter = [[NSDateFormatter alloc] init];
    formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    formatter.timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0];
    formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX";
  });
  return [formatter stringFromDate:date];
}

static NSString *DueDateString(NSDateComponents *components, BOOL allDay) {
  if (!components) return (id)[NSNull null];

  NSCalendar *calendar = components.calendar ?: [NSCalendar currentCalendar];
  if (allDay || (components.hour == NSDateComponentUndefined && components.minute == NSDateComponentUndefined && components.second == NSDateComponentUndefined)) {
    if (components.year == NSDateComponentUndefined || components.month == NSDateComponentUndefined || components.day == NSDateComponentUndefined) return (id)[NSNull null];
    return [NSString stringWithFormat:@"%04ld-%02ld-%02ld", (long)components.year, (long)components.month, (long)components.day];
  }

  NSDate *date = [calendar dateFromComponents:components];
  return date ? ISODate(date) : (id)[NSNull null];
}

static NSString *ColorString(id color) {
  if (!color) return @"#007AFF";
  if ([color isKindOfClass:[NSString class]]) return color;

  CGFloat red = 0;
  CGFloat green = 0;
  CGFloat blue = 0;
  CGFloat alpha = 0;
  if ([color respondsToSelector:@selector(getRed:green:blue:alpha:)]) {
    BOOL didConvert = ((BOOL (*)(id, SEL, CGFloat *, CGFloat *, CGFloat *, CGFloat *))objc_msgSend)(
      color,
      @selector(getRed:green:blue:alpha:),
      &red,
      &green,
      &blue,
      &alpha
    );
    if (didConvert) {
      return [NSString stringWithFormat:@"#%02X%02X%02X", (int)round(red * 255), (int)round(green * 255), (int)round(blue * 255)];
    }
  }

  return @"#007AFF";
}

static NSString *PriorityString(NSInteger priority) {
  if (priority >= 7) return @"high";
  if (priority >= 5) return @"medium";
  if (priority >= 1) return @"low";
  return (id)[NSNull null];
}

static NSArray *SortedHashtagNames(id reminder) {
  id context = MSG_ID(reminder, @"hashtagContext");
  id hashtags = context ? MSG_ID(context, @"hashtags") : nil;
  NSMutableSet *names = [NSMutableSet set];

  for (id hashtag in hashtags ?: @[]) {
    NSString *name = StringValue(MSG_ID(hashtag, @"name"));
    if (name.length) [names addObject:name];
  }

  return [[names allObjects] sortedArrayUsingSelector:@selector(localizedCaseInsensitiveCompare:)];
}

static NSDictionary *ListDictionary(id list) {
  if (!list) return (id)[NSNull null];
  id storage = [list respondsToSelector:NSSelectorFromString(@"storage")] ? MSG_ID(list, @"storage") : nil;
  id objectID = MSG_ID(list, @"remObjectID");
  NSString *title = StringValue([list respondsToSelector:NSSelectorFromString(@"name")] ? MSG_ID(list, @"name") : MSG_ID(list, @"title"));
  id color = [list respondsToSelector:NSSelectorFromString(@"ekColor")] ? MSG_ID(list, @"ekColor") : nil;

  return @{
    @"id": UUIDStringForObjectID(objectID),
    @"title": title,
    @"color": ColorString(color),
    @"isDefault": storage && [storage respondsToSelector:NSSelectorFromString(@"isDefaultList")] ? @(MSG_BOOL(storage, @"isDefaultList")) : @NO,
  };
}

static NSDictionary *ReminderDictionary(id reminder, NSDictionary *listByID) {
  id storage = MSG_ID(reminder, @"storage");
  id objectID = MSG_ID(reminder, @"remObjectID");
  NSString *idString = UUIDStringForObjectID(objectID);
  NSString *listID = UUIDStringForObjectID(MSG_ID(storage, @"listID"));
  NSDate *creationDate = MSG_ID(storage, @"creationDate");
  NSDate *completionDate = MSG_ID(storage, @"completionDate");
  id dueComponents = MSG_ID(storage, @"dueDateComponents");
  BOOL allDay = [storage respondsToSelector:NSSelectorFromString(@"allDay")] ? MSG_BOOL(storage, @"allDay") : NO;

  return @{
    @"id": idString,
    @"openUrl": [@"x-apple-reminderkit://REMCDReminder/" stringByAppendingString:idString],
    @"attachedUrls": @[],
    @"title": StringValue(MSG_ID(storage, @"titleAsString")),
    @"notes": StringValue(MSG_ID(storage, @"notesAsString")),
    @"dueDate": DueDateString(dueComponents, allDay) ?: (id)[NSNull null],
    @"isCompleted": @([storage respondsToSelector:NSSelectorFromString(@"isCompleted")] ? MSG_BOOL(storage, @"isCompleted") : NO),
    @"priority": PriorityString([storage respondsToSelector:NSSelectorFromString(@"priority")] ? MSG_INTEGER(storage, @"priority") : 0),
    @"completionDate": completionDate ? ISODate(completionDate) : @"",
    @"isRecurring": @([storage respondsToSelector:NSSelectorFromString(@"isRecurrent")] ? MSG_BOOL(storage, @"isRecurrent") : NO),
    @"recurrenceRule": @"",
    @"list": listByID[listID] ?: (id)[NSNull null],
    @"creationDate": creationDate ? @([creationDate timeIntervalSinceReferenceDate]) : (id)[NSNull null],
    @"hashtags": SortedHashtagNames(reminder),
  };
}

static NSArray *FetchLists(id store) {
  NSError *error = nil;
  id lists = ((id (*)(id, SEL, NSError **))objc_msgSend)(store, NSSelectorFromString(@"fetchListsForEventKitBridgingWithError:"), &error);
  if (error) @throw [NSException exceptionWithName:@"ReminderKitError" reason:error.localizedDescription userInfo:nil];
  return lists ?: @[];
}

static NSArray *LegacyTextTags(NSString *title, NSString *notes);
static NSArray *NativeTagsToAdd(NSArray *legacyTags, NSArray *nativeTags);
static NSArray *TagConflicts(NSArray *legacyTags, NSArray *nativeTags);

static id CreateStore(void) {
  void *handle = dlopen([ReminderKitPath UTF8String], RTLD_NOW);
  if (!handle) {
    @throw [NSException exceptionWithName:@"ReminderKitLoadError" reason:@"Could not load private ReminderKit framework" userInfo:nil];
  }

  Class storeClass = NSClassFromString(@"REMStore");
  if (!storeClass) {
    @throw [NSException exceptionWithName:@"ReminderKitLoadError" reason:@"REMStore class not found" userInfo:nil];
  }

  return [[storeClass alloc] init];
}

static NSDictionary *BuildData(BOOL includeMigrationProposal) {
  id store = CreateStore();
  NSArray *lists = FetchLists(store);
  NSMutableArray *listDictionaries = [NSMutableArray array];
  NSMutableDictionary *listByID = [NSMutableDictionary dictionary];
  NSMutableArray *reminders = [NSMutableArray array];
  NSMutableArray *migration = [NSMutableArray array];

  for (id list in lists) {
    NSDictionary *listDictionary = ListDictionary(list);
    [listDictionaries addObject:listDictionary];
    listByID[listDictionary[@"id"]] = listDictionary;
  }

  for (id list in lists) {
    NSError *error = nil;
    id fetchedReminders = ((id (*)(id, SEL, NSError **))objc_msgSend)(list, NSSelectorFromString(@"fetchRemindersWithError:"), &error);
    if (error) @throw [NSException exceptionWithName:@"ReminderKitError" reason:error.localizedDescription userInfo:nil];

    for (id reminder in fetchedReminders ?: @[]) {
      if (![[reminder className] isEqualToString:@"REMReminder"]) continue;
      id storage = MSG_ID(reminder, @"storage");
      if ([storage respondsToSelector:NSSelectorFromString(@"isCompleted")] && MSG_BOOL(storage, @"isCompleted")) continue;

      NSDictionary *reminderDictionary = ReminderDictionary(reminder, listByID);
      [reminders addObject:reminderDictionary];

      if (includeMigrationProposal) {
        NSDictionary *listDictionary = reminderDictionary[@"list"] == [NSNull null] ? nil : reminderDictionary[@"list"];
        if ([listDictionary[@"title"] isEqualToString:@"Einkauf"]) continue;

        NSArray *legacyTags = LegacyTextTags(reminderDictionary[@"title"], reminderDictionary[@"notes"]);
        NSArray *nativeTags = reminderDictionary[@"hashtags"];
        NSArray *tagsToAdd = NativeTagsToAdd(legacyTags, nativeTags);
        NSArray *conflicts = TagConflicts(legacyTags, nativeTags);
        if (legacyTags.count || tagsToAdd.count || conflicts.count) {
          [migration addObject:@{
            @"reminderId": reminderDictionary[@"id"],
            @"title": reminderDictionary[@"title"],
            @"list": listDictionary ?: (id)[NSNull null],
            @"currentNativeTags": nativeTags ?: @[],
            @"legacyTextTags": legacyTags,
            @"nativeTagsToAdd": tagsToAdd,
            @"conflicts": conflicts,
          }];
        }
      }
    }
  }

  if (includeMigrationProposal) {
    return @{@"lists": listDictionaries, @"reminders": reminders, @"migration": migration};
  }
  return @{@"lists": listDictionaries, @"reminders": reminders};
}

static NSDictionary *GetData(void) {
  return BuildData(NO);
}

static NSDictionary *MigrationDryRun(void) {
  return BuildData(YES);
}

static NSDictionary *FindReminder(NSString *reminderID) {
  id store = CreateStore();
  NSMutableDictionary *listByID = [NSMutableDictionary dictionary];
  NSArray *lists = FetchLists(store);

  for (id list in lists) {
    NSDictionary *listDictionary = ListDictionary(list);
    listByID[listDictionary[@"id"]] = listDictionary;
  }

  for (id list in lists) {
    NSError *error = nil;
    id reminders = ((id (*)(id, SEL, NSError **))objc_msgSend)(list, NSSelectorFromString(@"fetchRemindersWithError:"), &error);
    if (error) @throw [NSException exceptionWithName:@"ReminderKitError" reason:error.localizedDescription userInfo:nil];
    for (id reminder in reminders ?: @[]) {
      if (![[reminder className] isEqualToString:@"REMReminder"]) continue;
      NSString *currentID = UUIDStringForObjectID(MSG_ID(reminder, @"remObjectID"));
      if ([currentID caseInsensitiveCompare:reminderID] == NSOrderedSame) {
        return @{@"store": store, @"reminder": reminder, @"listByID": listByID};
      }
    }
  }
  return nil;
}

static NSDictionary *GetReminderTags(NSDictionary *payload) {
  NSString *reminderID = StringValue(payload[@"reminderId"]);
  NSDictionary *lookup = FindReminder(reminderID);
  id reminder = lookup[@"reminder"];
  if (!reminder) @throw [NSException exceptionWithName:@"NotFound" reason:@"Reminder not found" userInfo:nil];
  return @{@"reminderId": reminderID, @"hashtags": SortedHashtagNames(reminder)};
}

static NSSet *ManagedTagPrefixes(void) {
  static NSSet *prefixes;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    prefixes = [NSSet setWithArray:@[@"area_", @"matrix_", @"freelance_", @"effort_", @"status_"]];
  });
  return prefixes;
}

static NSString *NormalizeTagName(NSString *tag) {
  NSString *trimmed = [StringValue(tag) stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  while ([trimmed hasPrefix:@"#"]) trimmed = [trimmed substringFromIndex:1];
  return trimmed;
}

static BOOL IsManagedTag(NSString *tag) {
  for (NSString *prefix in ManagedTagPrefixes()) {
    if ([tag hasPrefix:prefix]) return YES;
  }
  return NO;
}

static NSString *ManagedPrefixForTag(NSString *tag) {
  for (NSString *prefix in ManagedTagPrefixes()) {
    if ([tag hasPrefix:prefix]) return prefix;
  }
  return nil;
}

static NSArray *LegacyTextTags(NSString *title, NSString *notes) {
  NSString *text = [NSString stringWithFormat:@"%@\n%@", title ?: @"", notes ?: @""];
  NSError *error = nil;
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"#[A-Za-z0-9_]+" options:0 error:&error];
  NSMutableSet *tags = [NSMutableSet set];

  [regex enumerateMatchesInString:text options:0 range:NSMakeRange(0, text.length) usingBlock:^(NSTextCheckingResult *result, NSMatchingFlags flags, BOOL *stop) {
    NSString *tag = NormalizeTagName([text substringWithRange:result.range]);
    if (IsManagedTag(tag)) [tags addObject:tag];
  }];

  return [[tags allObjects] sortedArrayUsingSelector:@selector(localizedCaseInsensitiveCompare:)];
}

static NSArray *NativeTagsToAdd(NSArray *legacyTags, NSArray *nativeTags) {
  NSSet *nativeSet = [NSSet setWithArray:nativeTags ?: @[]];
  NSMutableArray *tagsToAdd = [NSMutableArray array];
  for (NSString *tag in legacyTags ?: @[]) {
    if (![nativeSet containsObject:tag]) [tagsToAdd addObject:tag];
  }
  return tagsToAdd;
}

static NSArray *TagConflicts(NSArray *legacyTags, NSArray *nativeTags) {
  NSMutableArray *conflicts = [NSMutableArray array];
  for (NSString *legacyTag in legacyTags ?: @[]) {
    NSString *prefix = ManagedPrefixForTag(legacyTag);
    if (!prefix) continue;
    for (NSString *nativeTag in nativeTags ?: @[]) {
      if ([nativeTag hasPrefix:prefix] && ![nativeTag isEqualToString:legacyTag]) {
        [conflicts addObject:@{@"categoryPrefix": prefix, @"legacyTag": legacyTag, @"nativeTag": nativeTag}];
      }
    }
  }
  return conflicts;
}

static NSDictionary *ExistingHashtagsByName(id reminder) {
  id context = MSG_ID(reminder, @"hashtagContext");
  id hashtags = context ? MSG_ID(context, @"hashtags") : nil;
  NSMutableDictionary *byName = [NSMutableDictionary dictionary];
  for (id hashtag in hashtags ?: @[]) {
    NSString *name = StringValue(MSG_ID(hashtag, @"name"));
    if (name.length) byName[name] = hashtag;
  }
  return byName;
}

static NSDictionary *SaveReminderTagChanges(NSString *reminderID, void (^mutate)(id hashtagContext, NSDictionary *existingHashtags)) {
  NSDictionary *lookup = FindReminder(reminderID);
  id store = lookup[@"store"];
  id reminder = lookup[@"reminder"];
  if (!reminder) @throw [NSException exceptionWithName:@"NotFound" reason:@"Reminder not found" userInfo:nil];

  NSDictionary *existingHashtags = ExistingHashtagsByName(reminder);
  Class saveRequestClass = NSClassFromString(@"REMSaveRequest");
  id saveRequest = ((id (*)(id, SEL, id))objc_msgSend)([saveRequestClass alloc], NSSelectorFromString(@"initWithStore:"), store);
  id reminderChangeItem = ((id (*)(id, SEL, id))objc_msgSend)(saveRequest, NSSelectorFromString(@"updateReminder:"), reminder);
  id hashtagContext = MSG_ID(reminderChangeItem, @"hashtagContext");

  mutate(hashtagContext, existingHashtags);

  NSError *error = nil;
  BOOL ok = ((BOOL (*)(id, SEL, NSError **))objc_msgSend)(saveRequest, NSSelectorFromString(@"saveSynchronouslyWithError:"), &error);
  if (!ok || error) @throw [NSException exceptionWithName:@"ReminderKitSaveError" reason:error.localizedDescription ?: @"Could not save reminder" userInfo:nil];

  NSDictionary *updatedLookup = FindReminder(reminderID);
  id updatedReminder = updatedLookup[@"reminder"];
  return @{@"reminder": ReminderDictionary(updatedReminder ?: reminder, updatedLookup[@"listByID"] ?: lookup[@"listByID"])};
}

static NSDictionary *AddTag(NSDictionary *payload) {
  NSString *reminderID = StringValue(payload[@"reminderId"]);
  NSString *tag = NormalizeTagName(payload[@"tag"]);
  if (!tag.length) @throw [NSException exceptionWithName:@"InvalidArgument" reason:@"Tag is required" userInfo:nil];

  return SaveReminderTagChanges(reminderID, ^(id hashtagContext, NSDictionary *existingHashtags) {
    if (!existingHashtags[tag]) {
      ((id (*)(id, SEL, NSInteger, id))objc_msgSend)(hashtagContext, NSSelectorFromString(@"addHashtagWithType:name:"), 0, tag);
    }
  });
}

static NSDictionary *RemoveTag(NSDictionary *payload) {
  NSString *reminderID = StringValue(payload[@"reminderId"]);
  NSString *tag = NormalizeTagName(payload[@"tag"]);
  if (!tag.length) @throw [NSException exceptionWithName:@"InvalidArgument" reason:@"Tag is required" userInfo:nil];

  return SaveReminderTagChanges(reminderID, ^(id hashtagContext, NSDictionary *existingHashtags) {
    id existing = existingHashtags[tag];
    if (existing) {
      ((void (*)(id, SEL, id))objc_msgSend)(hashtagContext, NSSelectorFromString(@"removeHashtag:"), existing);
    }
  });
}

static NSDictionary *SetTags(NSDictionary *payload) {
  NSString *reminderID = StringValue(payload[@"reminderId"]);
  NSArray *rawTags = [payload[@"tags"] isKindOfClass:[NSArray class]] ? payload[@"tags"] : @[];
  NSMutableSet *desiredTags = [NSMutableSet set];
  for (id rawTag in rawTags) {
    NSString *tag = NormalizeTagName(rawTag);
    if (tag.length) [desiredTags addObject:tag];
  }

  return SaveReminderTagChanges(reminderID, ^(id hashtagContext, NSDictionary *existingHashtags) {
    for (NSString *tag in desiredTags) {
      if (!existingHashtags[tag]) {
        ((id (*)(id, SEL, NSInteger, id))objc_msgSend)(hashtagContext, NSSelectorFromString(@"addHashtagWithType:name:"), 0, tag);
      }
    }

    for (NSString *tag in existingHashtags) {
      if (IsManagedTag(tag) && ![desiredTags containsObject:tag]) {
        ((void (*)(id, SEL, id))objc_msgSend)(hashtagContext, NSSelectorFromString(@"removeHashtag:"), existingHashtags[tag]);
      }
    }
  });
}

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    @try {
      if (argc < 2) {
        @throw [NSException exceptionWithName:@"MissingCommand" reason:@"Missing command" userInfo:nil];
      }

      NSString *command = [NSString stringWithUTF8String:argv[1]];
      if ([command isEqualToString:@"getData"]) {
        PrintJSON(GetData());
      } else if ([command isEqualToString:@"getReminderTags"]) {
        PrintJSON(GetReminderTags(JSONArgument(2, argc, argv)));
      } else if ([command isEqualToString:@"addTag"]) {
        PrintJSON(AddTag(JSONArgument(2, argc, argv)));
      } else if ([command isEqualToString:@"removeTag"]) {
        PrintJSON(RemoveTag(JSONArgument(2, argc, argv)));
      } else if ([command isEqualToString:@"setTags"]) {
        PrintJSON(SetTags(JSONArgument(2, argc, argv)));
      } else if ([command isEqualToString:@"migrationDryRun"]) {
        PrintJSON(MigrationDryRun());
      } else {
        @throw [NSException exceptionWithName:@"UnknownCommand" reason:[NSString stringWithFormat:@"Unknown command: %@", command] userInfo:nil];
      }
      return 0;
    } @catch (NSException *exception) {
      NSDictionary *error = @{@"error": exception.name ?: @"Error", @"message": exception.reason ?: @"Unknown error"};
      fprintf(stderr, "%s\n", [JSONString(error) UTF8String]);
      return 1;
    }
  }
}
