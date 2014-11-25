define([
  'jquery',
  'jqueryui',
  'underscore',
  'backbone',
  'marionette',
  'vent',
  'myapp',
  'nestable',
  'modernizr',
  'autosize',
  'bootstrap-switch',
  'utility',
  'simpleStorage',
  'tock',
  'ScrollTo',
  'views/home/ItemView',
  'views/home/ListEditView',
  'text!templates/home/listItemsTemplate.html',
  'flippy',
  'viewport',
  'firebase',
  'backfire'
], function($, jqueryui, _, Backbone, Marionette, vent, app, nestable, modernizr, autosize, bootstrapSwitch, utility, simpleStorage,Tock, ScrollTo, ItemView, ListEditView, listItemsTemplate){

  var ListItemsView = Marionette.CompositeView.extend({
    itemView: ItemView,
    itemViewContainer: ".dd-list",
    template: listItemsTemplate,
    events: {
      "click .newListItem" : "newListItem",
      "click .deleteListItem" : "deleteListItem",
      "click .newSection" : "newSection",
      "focus .descriptionTextarea" : "selectListItemEdit",
      "blur .listItemDescription" : "blurListItem",
      "keydown .form-control" : "checkKeyDown",
      "mouseup .bootstrap-switch" : "switchMouseUp",
      "click .toggleTimer" : "toggleTimer",
      "change .listModeSelect" : "listModeSelect",
      "mouseenter .live-item" : "buttonHoverOn",
      "mouseleave .live-item" : "buttonHoverOff",
      "mouseenter .listTitle" : "listTitleHoverOn",
      "mouseleave .listTitle" : "listTitleHoverOff",
      "click .listTitle" : "listEdit",
      "click .listItemButton" : "selectListItem"
    },

    initialize: function(data) {

      var that = this;

      //listen for keyUps for making new list items and sections
      _.bindAll(this, 'checkKeyUp');
      $(document).bind('keyup', this.checkKeyUp);

      var ListItem = Backbone.Model.extend({
        defaults: {
          //numerical display for items, shows up to the left of each listItem. This number is not used for sections.
          index: 0,
          //absolute order in the list. Is not used for display, only for ordering on screen
          order: 0,
          //text that shows in the item text body
          title: "Unknown",
          //can be item or section
          list_type: "item",
          //state of item
          state: "pre_active"
        }
      });

      this.timer = {};
      this.listModel = {};
      app.activeList = data.id;

      //if the listMode was not previously set globablly in app.js (using simpleStorage) then default to "watch" mode.
      if(utility.isEmpty(app.listMode[data.id])) {
        app.listMode[data.id] = "watch";
        this.listMode = "watch";
      }
      else {
        this.listMode = app.listMode[data.id];
      }

      //collection of all the listItems
      var ListItems = Backbone.Collection.extend({
        model: ListItem,
        //firebase: new Firebase(app.firebaseURL + '/items/' + data.id)
      });

      this.collection = new ListItems();
      this.listId = data.id;

      //setup defaults
      this.newListItemWasMade = false;
      this.switchIsDrawn = false;
      this.switchState = false;
      this.windoWidthBreakPoints = { "xs" : 20, "sm" : 40, "md" : 80, "lg" : 115 }
      this.defaultDescHeight = 40;
      this.wasEscKey = "no";
      this.firstOnShow = true;

      //create new Tock timer object. Attach to View
      this.tock1 = new Tock({
        callback: function () {
            //find lap time: (exact time of timer)  +  1000ms
            //intervalTime = that.tock1.lap() + that.tock1.timeToMS("00:00:01");
            intervalTime = that.tock1.lap();

            //set the timer UI to HH:MM:SS (timecode) of the current lap time. This uses the msToTimecode() function which converts milliseconds to timecode form
            $('#clock').val(that.tock1.msToTimecode(intervalTime));
        }
      });

      //specify the Backbone comparator so each list is sorted by the "order" attribute
      this.collection.comparator = "order"; 

      //UPDATE LIST AFTER A CHANGE
      //this.listenTo(this.collection, 'add ch', this.render,this);

      //Init Firebase connectors
      this.listData = new Firebase(app.firebaseURL + '/lists/' + this.listId); //for the whole list
      this.listItemsData = new Firebase(app.firebaseURL + '/items/' + this.listId); //for the list items
      this.timersData = new Firebase(app.firebaseURL + '/timers/' + this.listId); //for the timers associated with this list

      //fire each time list item state is changed
      this.listItemsData.on("value", function(snapshot) {
        snapshot.forEach(function(element) {
          //add each item back into the collection with new changes ({merge: true} is set)
          that.collection.add(element.val(),{merge:true});
        });
        //sort the collection by the comparator, which is "order"
        that.collection.sort();
        //force a render
        that.render();
        that.setNestable();
      });
      //fire each time list item is removed
      this.listItemsData.on('child_removed', function(oldChildSnapshot) {
        model = that.collection.where({id: oldChildSnapshot.key()})[0];
        that.collection.remove(model);

        that.render();
        that.setNestable();
      });

      //fire when timers change
      this.timersData.once('value', function(childSnapshot) {
        if(utility.isEmpty(childSnapshot.val())) {

          newTimer = {state: "stopped", action_time: 0, duration: 0};
          fbTimerObj = that.timersData.push(newTimer);
          $('.toggleTimer').data('id',fbTimerObj.key());
          //handle the state of the timer
          that.setTimerState(newTimer);
          //set the timer object for the view. This is used later in toggleTimer()
          that.timers = {};
          that.timers[fbTimerObj.key()] = newTimer;
          $('#toggleTimer').data('id',fbTimerObj.key());

        }
        else {
          //TODO extend this accept multiple timers in the future
          that.timers = childSnapshot.val();
          $.each(that.timers, function (key, timer) {
            that.setTimerState(timer);

            $('#toggleTimer').data('id',key);
          });
          
        }
      });

      //fire when timers change
      this.timersData.on('child_changed', function(childSnapshot) {
        that.setTimerState(childSnapshot.val());
      });

    },
    onRender: function() {
      var that = this;
      //set the listTitle here in onRender so that when the view is rerendered the title doesn't dissappear
      $('.listTitle').html('<strong>'+this.listTitle+'</strong>');
      this.drawListMode();

      if(!utility.isEmpty(this.timers)) {
        $.each(this.timers, function (key, timer) {
          that.setTimerState(timer);

          $('#toggleTimer').data('id',key);
        });
      }

      //setup the sticky Navbar
      this.setStickyNavbar();

      //if the window is resized (e.g. phone is rotated to landscape mode) then redraw the Navbar with the new width
      $( window ).resize(function() {
        $('.controlsNavbarClass').css('width',$('.listItemsPanel').width());
        $('#hiddenBreaks').css('height',$('.controlsNavbarClass').height() + 19);
      });

      //set the "open list in new tab" URL in the view
      $('#listInNewTab').attr('href',"http://" + document.domain + "/lists/" + this.id);

      //autosize the textarea and its container
      $('textarea').autosize({
        callback: function() {
          $(this).closest('.listItemDescription').css("height", parseInt($(this).css("height")) + 2 );
        }
      });


      //set the initial height of the "hiddenBreaks" div that makes the sticky navbar look good
      $('#hiddenBreaks').css('height',$('.controlsNavbarClass').height() + 19);
    },
    onClose: function(arg1, arg2){
      //stop the Firehose Consumer so we don't have multiple consumers running at the same time
      // this.firehose_consumer.stop();
      this.listData.off('value');
      this.listItemsData.off('value');
      this.listItemsData.off('child_removed');
      this.timersData.off('child_changed');

      this.tock1.stop();
    },

    onShow: function(){

      var that = this;

      //this.collection.sort();

      this.listData.on('value',function(dataSnapshot) {
        //set the title of the list in the view
        that.listTitle = dataSnapshot.val().title;
        $('.listTitle').html('<strong>'+dataSnapshot.val().title+'</strong>');
      });

      //setup UI controls depending on the listMode.
      this.drawListMode();

      // if the list is in "edit" mode then setup Nestable for the first onShow. After initial onShow setting up nestable is handleded by the switchMode function
      if(this.listMode === "edit" && this.firstOnShow) {
        this.setNestable();
        this.firstOnShow = false;
      }



    },
    setTimerState: function(timer) {
      
      //handle timer state
      if(timer.state === "stopped") {
        $('.toggleTimer').removeClass('btn-danger').addClass('btn-success').html('Start');

        this.tock1.stop();

        //if timer is stopped then just set timer value to the previously saved duration (could be zero)
        $('#clock').val(this.tock1.msToTimecode(timer.duration));

      }
      else if(timer.state === "started") {

        $('.toggleTimer').removeClass('btn-success').addClass('btn-danger').html('Pause');

        //if timer is started then subject current time from the start time to set current timer value.
        currentTime = Date.now();
        
        //$('#clock').val(this.tock1.msToTimecode(currentTime - this.timer.action_time));
        //$('#clock').val(this.tock1.msToTimecode(timer.duration));

        //if state is started then start the timer on the client
        //custom modification to Tock.js library allows us to pass milliseconds as a start_time for the timer. In this case we pass the time that is saved on the server
        this.tock1.start(currentTime - timer.action_time) + timer.duration;
      }

    },
    //call the Nestable library on the list items. This happens during edit mode
    setNestable: function() {

      var that = this;

      $('.dd').nestable({ 
        
        callback: function(l,e) {
          // l is the main container
          // e is the element that was moved

          listItems = $('.dd').nestable('serialize');

          idThatMoved = e.data('id');
          typeThatMoved = e.data('list_type');

          listItemIndexTracker = 0;
          for (var key in listItems) {
            // console.log(key);
            if(listItems[key].list_type === "item") {
              listItemIndexTracker += 1;
            }
            
            if(listItems[key].id === idThatMoved) {
              
              newIndex = listItemIndexTracker;
              oldIndex = parseInt(listItems[key].index);
              newOrder = parseInt(key);
              oldOrder = parseInt(listItems[key].order);

              // console.log("newIndex: "+newIndex);
              // console.log("oldIndex: "+oldIndex);
              // console.log("newOrder: "+newOrder);
              // console.log("oldOrder: "+oldOrder);
              // console.log("idThatMoved: "+idThatMoved);
              // console.log("typeThatMoved: "+typeThatMoved);
            }
          }

          moveDirection = (newOrder > oldOrder) ? "higher" : "lower";
          //console.log(moveDirection);
          count = 0;
          
          //TODO update changed listItems in bulk instead of one at a time with $.each. This will significantly increase performance on viewer's lists. Current method is crude and slow to update since it will issue a PATCH for each list item modified.
          $.each(that.collection.models,function(i,item) {
            attrs = {};
            currentOrder = item.get("order");
            currentIndex = item.get("index");
            if(moveDirection === "lower") {
              //if item isn't the one that moved but it's within the reordering range then set new order
              //the "reordering range" is if it's (1) greater than or equal to the new order spot of the moved item
              //                                  (2) less than the old order spot of the moved item
              if(item.get("id") !== idThatMoved && item.get("order") >= newOrder && item.get("order") < oldOrder) {
                attrs["order"] = (currentOrder + 1);
                //item.set("order",currentOrder + 1);
                //console.log("TITLE IS: " +item.get("title") + " and I'm in the order add one if");
              }

              //if item is a item and a item was moved
              if(item.get("list_type") === "item" && typeThatMoved === "item") {
                //if item isn't the listItem that moved and it's within the reindexing range then change it
                if(item.get("id") !== idThatMoved && item.get("index") >= newIndex && item.get("index") < oldIndex ) {
                  attrs["index"] = (currentIndex + 1);
                  //item.set("index",currentIndex + 1);
                }
                else if(item.get("id") === idThatMoved) {  //if it is the one that moved then set it to the new values reported by netstable's callback
                  //item.set("index",newIndex);
                  //item.set("order",newOrder);
                  attrs = {"index" : newIndex,"order":newOrder};
                }
              }
              else { //if a section moved
                if(item.get("id") === idThatMoved) {
                  //item.set("order",newOrder);
                  attrs["order"] = newOrder;
                }
              }
            }
            else { // moveDirection is higher
              if(item.get("id") !== idThatMoved && item.get("order") <= newOrder && item.get("order") > oldOrder) {
                attrs["order"] = (currentOrder - 1);
                //item.set("order",currentOrder - 1);
                if(item.get("title") == "carrot") {
                  //console.log("IT'S A CARROT!");
                }
                //console.log("TITLE IS: " +item.get("title") + " and I'm in the order subtract one if");
              }

              if(item.get("list_type") === "item" && typeThatMoved === "item") {
                if(item.get("id") !== idThatMoved && item.get("index") <= newIndex && item.get("index") > oldIndex ) {
                  attrs["index"] = (currentIndex - 1);
                  //item.set("index",currentIndex - 1);
                }
                else if(item.get("id") === idThatMoved) {
                  //item.set("index",newIndex);
                  //item.set("order",newOrder);
                  attrs = {"index" : newIndex,"order":newOrder};
                }
              }
              else { //if a section moved
                if(item.get("id") === idThatMoved) {
                  //item.set("order",newOrder);
                  attrs["order"] = newOrder;
                }
              }
            }

            //update model if it needs updating
            if(!utility.isEmpty(attrs)) {
              item.set(attrs);
              itemRef = new Firebase(app.firebaseURL + '/items/' + that.listId + '/' + item.id);
              itemRef.setWithPriority(item.toJSON(),attrs.order);
            }

          });

          //that.collection.sort();

          //that.render();
          // that.onShow();
          that.setNestable();

        }

        

      });

    },
    drawListMode: function() {

      //set the list mode select to the correct value
      $('.listModeSelect').val(this.listMode);

      switch(this.listMode) {

        case "watch":
          //hide create/delete buttons
          $('.editButtonType').hide();
          $('.controlButtonType').hide();
          break;

        case "control":
          //hide create/delete buttons
          $('.editButtonType').hide();
          $('.controlButtonType').show();
          break;

        case "edit":
          //hide create/delete buttons
          $('.editButtonType').show();
          $('.controlButtonType').show();
          break;        

      }

    },
    listModeSelect: function(e) {

      var that = this;

      if (e.type === "change") {
        listModeSelection = $(e.currentTarget).val();
      }
      else {
        listModeSelection = this.listMode;
      }

      //if user is actually changing the list mode then change it
      //if(this.listMode !== listModeSelection) {

        this.previousListMode = this.listMode;
        this.listMode = listModeSelection;
        app.listMode[this.listId] = listModeSelection;

        this.drawListMode();

        //storage listmode on client side
        //simpleStorage.set('listMode',listModeSelection);   //global listMode
        simpleStorage.set(this.listId, {"listMode" : listModeSelection});  //per list specific listMode

        // $.each(this.collection.models, function(i,item) {
        //   item.set('list_mode',listModeSelection);
        // });

        switch(listModeSelection) {

          case "watch":
            //check if previous in control mode. If so we don't need to flip
            if(this.previousListMode !== "control") {
              
              $.each(this.collection.models, function(i,item){

                setTimeout(function() {
                  $("li[data-id=" + item.get("id") + "]").flippy({
                  verso: '<div class="panel panel-default live-item" style="height:50px"><div class="panel-body" id="' + item.get("id") + '"><button type="button" data-id="' + item.get("id") + '" data-index="' + item.get('index') + '" class="btn btn-grey btn-lg btn-block listItemButton list_item_' + item.get('state') + '" style="text-align: left; padding-left: 10px" id=btn-' + item.id + '>' + item.get("title") + '</button></div></div>',
                  direction: "TOP",
                  duration: "200"
                  //depth:"0.09"
                });
                },100 + (i * 160));


              });
            }

            break;

          case "control":
            //check if previous in control mode. If so we don't need to flip
            if(this.previousListMode !== "watch") {
              $.each(this.collection.models, function(i,item){

                setTimeout(function() {
                  $("li[data-id=" + item.get("id") + "]").flippy({
                  verso: '<div class="panel panel-default live-item" style="height:50px"><div class="panel-body" id="' + item.get("id") + '"><button type="button" data-id="' + item.get("id") + '" data-index="' + item.get('index') + '" class="btn btn-grey btn-lg btn-block listItemButton list_item_' + item.get('state') + '" style="text-align: left; padding-left: 10px" id=btn-' + item.id + '>' + item.get("title") + '</button></div></div>',
                  direction: "TOP",
                  duration: "200"
                  //depth:"0.09"
                });
                },100 + (i * 160));


              });
            }

            break;

          case "edit":
            $.each(this.collection.models, function(i,item){

              setTimeout(function() {
                $("li[data-id=" + item.get("id") + "]").flippy({
                //verso: '<div class="panel panel-default live-item" style="height:50px"><div class="panel-body" id="' + item.get("id") + '"><button type="button" class="btn btn-default btn-lg btn-block" style="text-align: left; padding-left: 10px; background-color: #858585;" id=btn-' + item.id + '>' + item.get("title") + '</button></div></div>',
                verso: '<div class="dd-handle dd3-handle">Drag</div><div class="listItemDescription dd3-content"><h5><strong>' + item.get('index') + '</strong><textarea class="form-control descriptionTextarea" rows="1" style="width: 98%; margin-left: 16px; margin-top: -27px">' + item.get('title') + '</textarea></h5></div>',
                direction: "TOP",
                duration: "200"
                //depth:"0.09"
              });
              },100 + (i * 160));


            });

            //invoke Nestable on the listItems
            this.setNestable();


            break;

        }
      //}

    },
    showSwitch: function() {

      var that = this;
        $('#live-edit-switch').bootstrapSwitch('state',this.switchState);
        $('.bootstrap-switch').addClass('pull-right');
        this.switchIsDrawn = true;

        $('#live-edit-switch').on('switchChange.bootstrapSwitch', function(event, state) {
          that.switchState = state;
          that.toggleState(state);
        });
    },
    //this is for toggline the Edit/Live state of the overal list
    toggleState: function(state) {
      //state == true then we are in "live" mode
      //state == false then we are in "edit" mode

      if(state) {
        $.each(this.collection.models, function(i,item){

          setTimeout(function() {
            $("li[data-id=" + item.get("id") + "]").flippy({
            verso: '<div class="panel panel-default live-item" style="height:50px"><div class="panel-body" id="' + item.get("id") + '"><button type="button" class="btn btn-default btn-lg btn-block" style="text-align: left; padding-left: 10px; background-color: #858585;" id=btn-' + item.id + '>' + item.get("title") + '</button></div></div>',
            direction: "TOP",
            duration: "200"
            //depth:"0.09"
          });
          },100 + (i * 160));


        });

      }
      else {
        $.each(this.collection.models, function(i,item){
          setTimeout(function() {
            $("li[data-id=" + item.id + "]").flippyReverse();
          },100 + (i * 160));
        });
      }

        //optionally remove nestable classes here
        // $('.dd').removeClass('dd');
        // $('.dd-list').removeClass('dd-list');
      
    },
    buttonHoverOn: function(e) {
      if(this.listMode === "control") {
        //$(e.currentTarget).find('button').css("background-color","#A8A8A8");
      }
    },
    buttonHoverOff: function(e) {
      if(this.listMode === "control") {
        //$(e.currentTarget).find('button').css("background-color","#858585");
      }
    },
    //user clicks on a list item in control mode. For edit mode see selectListItem()
    selectListItem: function(e) {

      var that = this;

      if(this.listMode === "control") {

        selectedItem = $(e.currentTarget);
        selectedItemId = selectedItem.data('id');
        activeItemIndex = $('.list_item_active').data('index');

        //find direction user is moving in. If clicked index is greater than previously clicked index we are moving forward
        if(!utility.isEmpty(activeItemIndex)) {
          direction = (activeItemIndex < selectedItem.data('index')) ? 'forward' : 'backward';
        }
        else {
          activeItemIndex = 1;
          direction = 'forward';
        }

        if(direction === "forward") {
          //if moving forward then mark as post_active all items between active and previously active
          for(i=activeItemIndex;i<selectedItem.data('index');i++) {
            $("button[data-index=" + i + "]").removeClass('list_item_pre_active').removeClass('list_item_active').addClass('list_item_post_active');
            this.setModelById($('button[data-index=' + i + ']').data('id'),{"state":"post_active"});
          }
        }
        else {
          //if moving backward then mark as  pre_active all items between active and previously active
          for(i=activeItemIndex;i>selectedItem.data('index');i--) {
            $("button[data-index=" + i + "]").removeClass('list_item_post_active').removeClass('list_item_active').addClass('list_item_pre_active');
            this.setModelById($('button[data-index=' + i + ']').data('id'),{"state":"pre_active"});
          }
        }

        //highlight clicked item
        selectedItem.removeClass('list_item_pre_active').removeClass('list_item_post_active').addClass('list_item_active');
        
        // $.ajax({
        //   type: 'PATCH',
        //   url: '/lists/' + this.listId + '/' + selectedItemId + '/control',
        //   data: {"state":"active"},
        //   success: function() {
            
        //   }

        // });

        this.setModelById(selectedItemId,{"state":"active"});

      }

    },
    //add a new listItem to the list
    newListItem: function() {

      var that = this;

      listItemCount = this.collection.where({list_type:"item"}).length;
      // newOrder = (this.collection.length) ? this.collection.length + 1 : 0;

      // this.newListItem = new Backbone.Model({index: listItemCount+1, order: this.collection.length, list_type: "item", state: "pre_active", selected: false, title: "", list_mode: this.listMode});

      //item = new Firebase(app.firebaseURL + '/items/' + this.listId);
      newItem = this.listItemsData.push();
      newItem.setWithPriority({id: newItem.key(), index: listItemCount+1, order: this.collection.length, list_type: "item", state: "pre_active", selected: false, title: ""},this.collection.length);

      newListItem = this.collection.add({id: newItem.key(), index: listItemCount+1, order: this.collection.length, list_type: "item", state: "pre_active", selected: false, title: ""});
      //newListItem = this.collection.add({index: listItemCount+1, order: this.collection.length, list_type: "item", state: "pre_active", selected: false, title: ""});

      //that.render();
      //this.onShow();
      this.setNestable();

      this.newListItemWasMade = true;
      $("li[data-id=" + newListItem.id + "]").find('.form-control').focus();


    }, 
    //delete a listItem
    deleteListItem: function() {

      var that = this;

      //model = this.collection.where({selected: true})[0];
      orderToBeDeleted = this.prevSelectedModel.get("order");
      typeToBeDeleted = this.prevSelectedModel.get("list_type");

      //this.prevSelectedModel.destroy({});
      this.collection.remove(this.prevSelectedModel);

      deleteItem = new Firebase(app.firebaseURL + '/items/' + this.listId + '/' + model.id);
      deleteItem.remove();

      $.each(this.collection.models,function(i,item) {

        if(item.get("order") > orderToBeDeleted) {
          newOrder = item.get("order") - 1
          //item.set("order", item.get("order") - 1);

          attrs = {"order":newOrder};

          if(typeToBeDeleted === "item" && item.get("list_type") === "item") {
            newIndex = item.get("index") - 1
            //item.set("index", item.get("index") - 1);
            attrs = {"order":newOrder, "index": newIndex};
          }

          item.set(attrs);
          itemRef = new Firebase(app.firebaseURL + '/items/' + that.listId + '/' + item.id);
          itemRef.setWithPriority(item.toJSON(),attrs.order);
        }

      });
      
      //this.render();
      this.onShow();
      this.setNestable();


    },
    //add a new item to the list
    newSection: function() {

      section = new Backbone.Model({index: 0, order: this.collection.length, list_type: "section", selected: false, description: ""});

      newSection = this.collection.create(section);

      this.render();
      this.onShow();

      $("li[data-id=" + newSection.get("id") + "]").find('.form-control').focus();

    },

    descriptionSize: function(e) {

      listItemDescription = $(e.currentTarget);

      descLength = listItemDescription.find('.form-control').val().length;
      desc = listItemDescription.find('.form-control');
      //console.log("descLength is: " + descLength);
      currentDescHeight = parseInt(desc.css("height"));

      switch(this.windowWidth) {
        case "lg" :
          optimumSize = this.defaultDescHeight * (Math.floor(descLength/115) + 1);

          if (currentDescHeight !== optimumSize ) {
            
            desc.css("height", optimumSize);
            listItemDescription.css("height", optimumSize);
          }
        break;
      }

    },
    selectListItemEdit: function(e) {
      
      item = $(e.currentTarget);
      itemId = item.closest("li").data("id");
      item.addClass('nestable-selected');
      model = this.collection.where({id: itemId})[0];
      this.prevSelectedModel = model;

      if(this.newListItemWasMade) {
        this.newListItemWasMade = false;
      }
      else {
        //this.setModelById(itemId,{"selected": true});
      }
      
    },
    blurListItem: function(e) {

      $('.nestable-selected').removeClass("nestable-selected");

      if(this.wasEscKey === "no") {

        blurredListItem = $(e.currentTarget);
        blurredListItemValue = blurredListItem.find('.form-control').val();
        blurredListItemId = blurredListItem.closest('li').data('id');
        blurredListItemIndex = blurredListItem.closest('li').data('index');

        this.setModelById(blurredListItemId,{"selected":false, "title":blurredListItemValue});

        blurredListItem.removeClass("nestable-selected");

        this.wasEscKey = "no";

      }

    },
    checkKeyDown: function(e) {

      if(e.keyCode === 27) {
        this.wasEscKey = "yes";

        listItem = $(e.currentTarget);
        listItemId = listItem.closest('li').data('id');
        listItemIndex = listItem.closest('li').data('index');
        model = this.collection.where({id: listItemId})[0];
        listItem.val(model.get("description"));
        $('.nestable-selected').removeClass("nestable-selected");

        this.wasEscKey = "no";
        $(e.currentTarget).blur();
        
      }
      else if(e.keyCode === 13 && e.shiftKey) {
        $(e.currentTarget).blur();
      }

    },
    checkKeyUp: function(e) {
      //78 is n
      //77 is m

      //check if user is currently focused on a textarea. If so then we don't create a new section/listItem
      if(!$('.form-control').is(":focus")) {
        //if user hits m then make a new listItem
        if(e.keyCode === 109 || e.keyCode === 77) {
          this.newListItem();
        }
        else if(e.keyCode === 110 || e.keyCode === 78) {
          this.newSection();
        }
      }

    },
    //set a model's options based on it's ID
    setModelById: function(id,attrs) {

      //find the model that matches the currently selected listItem
      model = this.collection.where({id: id})[0];
      //set new attributes and merge back to the collection. Using remove: false so we don't remove the unmodified models
      // for (var newValue in options.values) {
      //   model.set(options.values[newValue].key, options.values[newValue].value);
      // }
      // console.log(model);
      model.set(attrs);
      updateItem = new Firebase(app.firebaseURL + '/items/' + this.listId + '/' + model.id);
      updateItem.update(attrs);
      //this.collection.set(model,{remove: false});

    },
    toggleTimer: function(e) {

      e.preventDefault();
      var that = this;
      
      timerId = $(e.currentTarget).data("id");
      //retrieve the clicked timer from all the timers associated with this list. They were previously attached to the Backbone view in initialize() after querying the Firebase server for all timers stored in this list
      timer = this.timers[timerId];
      
      //setup timer parameters to be stored on server
      var timerAction = {};  
      timerFirebase = new Firebase(app.firebaseURL + '/timers/' + this.listId + '/' + timerId);

      //if currently in the OFF state
      if(timer.state === "stopped") {

        //set action time to (current Unix time - previous time on timer)
        timer.action_time = Date.now() - that.tock1.timeToMS($('#clock').val());
        
        //handle timer state
        timer.duration = that.tock1.timeToMS($('#clock').val());
        //start_time = Date.now() - ms;

        //this.tock1.start(start_time);
        this.tock1.start(timer.duration);

        //change button from GO to Pause
        $('#toggleTimer').removeClass('btn-success').addClass('btn-danger').html('Pause');

        //update server with timer value
        timer.state = "started";
        timerFirebase.update(timer);

      }
      else if(timer.state === "started") {

        //set action time to current Unix time
        currentTime = Date.now();
        this.tock1.stop();

        //change button from Pause to Start
        $('#toggleTimer').removeClass('btn-danger').addClass('btn-success').html('Start');

        //update server with timer value
        timer.state = "stopped";
        timer.duration = currentTime - timer.action_time;
        timer.action_time = Date.now();
        timerFirebase.update(timer);
      }

    },
    nl2br: function (str, is_xhtml) {
      // From: http://phpjs.org/functions
      // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
      // +   improved by: Philip Peterson
      // +   improved by: Onno Marsman
      // +   improved by: Atli Þór
      // +   bugfixed by: Onno Marsman
      // +      input by: Brett Zamir (http://brett-zamir.me)
      // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
      // +   improved by: Brett Zamir (http://brett-zamir.me)
      // +   improved by: Maximusya
      // *     example 1: nl2br('Kevin\nvan\nZonneveld');
      // *     returns 1: 'Kevin<br />\nvan<br />\nZonneveld'
      // *     example 2: nl2br("\nOne\nTwo\n\nThree\n", false);
      // *     returns 2: '<br>\nOne<br>\nTwo<br>\n<br>\nThree<br>\n'
      // *     example 3: nl2br("\nOne\nTwo\n\nThree\n", true);
      // *     returns 3: '<br />\nOne<br />\nTwo<br />\n<br />\nThree<br />\n'
      var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br ' + '/>' : '<br>'; // Adjust comment to avoid issue on phpjs.org display

      return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
    },
    br2nl: function(str) {
      return str.replace(/<br>/g, "\r");
    },
    setStickyNavbar: function(data) {
      
      // name your elements here
         var stickyElement   = '.controlsNavbarClass',   // the element you want to make sticky
             bottomElement   = '.fakeFooter'; // the bottom element where you want the sticky element to stop (usually the footer) 
         // make sure the element exists on the page before trying to initalize
         if($( stickyElement ).length){
             $( stickyElement ).each(function(){
                 
                 // let's save some messy code in clean variables
                 // when should we start affixing? (the amount of pixels to the top from the element)
                 var fromTop = $( this ).offset().top, 
                     // where is the bottom of the element?
                     fromBottom = $( document ).height()-($( this ).offset().top + $( this ).outerHeight()),
                     // where should we stop? (the amount of pixels from the top where the bottom element is)
                     // also add the outer height mismatch to the height of the element to account for padding and borders
                     stopOn = $( document ).height()-( $( bottomElement ).offset().top)+($( this ).outerHeight() - $( this ).height()); 
                 // if the element doesn't need to get sticky, then skip it so it won't mess up your layout
                 if( (fromBottom-stopOn) > 200 ){

                     // let's put a sticky width on the element and assign it to the top
                     $( this ).css('width', $( this ).width()).css('top', 0).css('position', '');
                     // assign the affix to the element
                     $( this ).affix({
                         offset: { 
                             // make it stick where the top pixel of the element is
                             top: fromTop,  
                             // make it stop where the top pixel of the bottom element is
                             bottom: stopOn
                         }
                     // when the affix get's called then make sure the position is the default (fixed) and it's at the top
                     }).on('affix.bs.affix', function(){ 
                      $('#hiddenBreaks').show();
                      $( this ).css('top', 0).css('position', ''); 

                    }).on('affix-top.bs.affix', function() {
                      $('#hiddenBreaks').hide();

                    });
                 }
                 // trigger the scroll event so it always activates 
                 $( window ).trigger('scroll'); 
             }); 
         }
    },
    listTitleHoverOn: function() {
      $('.listTitle').css('color','#0072C6');
      $('.editListLabel').fadeIn(150);
    },
    listTitleHoverOff: function() {
      $('.listTitle').css('color','#FFFFFF');
      $('.editListLabel').fadeOut(150);
    },
    listEdit: function() {
      
      this.listModel.id = this.listId;

      var listEditView = new ListEditView(this.listModel);
      Backbone.history.navigate('/lists/' + this.listId + '/edit');
      app.content.show(listEditView);

    }


  });

  return ListItemsView;
  
});
